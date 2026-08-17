"use client";

import {
  useActionState,
  useEffect,
  useState
} from "react";

import { useRouter } from "next/navigation";

import {
  Bot,
  CheckCircle2,
  Clock3,
  Gamepad2,
  ImageUp,
  LoaderCircle,
  ShieldCheck,
  Swords,
  Trophy,
  UserCheck
} from "lucide-react";

import {
  acceptMatchAction,
  initialMatchActionState,
  startEvidenceAction
} from "@/app/(player)/matches/actions";

import { createClient } from "@/lib/supabase/client";

import styles from "./MatchRoomClient.module.css";

type PlayerData = {
  id: string;
  username: string;
  efootballUsername: string;
  team: string;
  division: number;
};

type MatchRoomClientProps = {
  matchId: string;
  currentUserId: string;
  playerOne: PlayerData;
  playerTwo: PlayerData;
  winnerId: string | null;
  stake: number;
  commissionRate: number;
  gameMode: string;
  initialStatus: string;
  playerOneAccepted: boolean;
  playerTwoAccepted: boolean;
  initialEvidenceDeadline: string | null;
  currentUserHasEvidence: boolean;
  opponentHasEvidence: boolean;
  verdict: string | null;
  verdictExplanation: string | null;
  detectedScore: string | null;
};

type MatchRealtimeData = {
  id: string;
  status: string;
  winner_id: string | null;
  player_one_accepted: boolean;
  player_two_accepted: boolean;
  evidence_deadline: string | null;
};

function formatCredits(
  amount: number
): string {
  return new Intl.NumberFormat("fr-FR").format(
    amount
  );
}

function formatGameMode(
  gameMode: string
): string {
  const labels: Record<string, string> = {
    MOBILE: "Mobile",
    PLAYSTATION: "PlayStation",
    XBOX: "Xbox",
    PC: "PC"
  };

  return labels[gameMode] ?? gameMode;
}

function getRemainingSeconds(
  deadline: string | null
): number {
  if (!deadline) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (
        new Date(deadline).getTime() -
        Date.now()
      ) / 1000
    )
  );
}

function formatTimer(
  seconds: number
): string {
  const minutes = Math.floor(
    seconds / 60
  );

  const remainingSeconds =
    seconds % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(remainingSeconds).padStart(
    2,
    "0"
  )}`;
}

export function MatchRoomClient({
  matchId,
  currentUserId,
  playerOne,
  playerTwo,
  winnerId,
  stake,
  commissionRate,
  gameMode,
  initialStatus,
  playerOneAccepted,
  playerTwoAccepted,
  initialEvidenceDeadline,
  currentUserHasEvidence,
  opponentHasEvidence,
  verdict,
  verdictExplanation,
  detectedScore
}: MatchRoomClientProps) {
  const router = useRouter();

  const [
    status,
    setStatus
  ] = useState(initialStatus);

  const [
    evidenceDeadline,
    setEvidenceDeadline
  ] = useState(
    initialEvidenceDeadline
  );

  const [
    remainingSeconds,
    setRemainingSeconds
  ] = useState(
    getRemainingSeconds(
      initialEvidenceDeadline
    )
  );

  const [
    hasEvidence,
    setHasEvidence
  ] = useState(
    currentUserHasEvidence
  );

  const [
    otherPlayerHasEvidence,
    setOtherPlayerHasEvidence
  ] = useState(
    opponentHasEvidence
  );

  const [
    selectedFile,
    setSelectedFile
  ] = useState<File | null>(null);

  const [
    uploadPending,
    setUploadPending
  ] = useState(false);

  const [
    uploadMessage,
    setUploadMessage
  ] = useState("");

  const [
    acceptState,
    acceptFormAction,
    acceptPending
  ] = useActionState(
    acceptMatchAction,
    initialMatchActionState
  );

  const [
    evidenceState,
    evidenceFormAction,
    evidencePending
  ] = useActionState(
    startEvidenceAction,
    initialMatchActionState
  );

  const isPlayerOne =
    currentUserId === playerOne.id;

  const currentPlayer =
    isPlayerOne
      ? playerOne
      : playerTwo;

  const opponent =
    isPlayerOne
      ? playerTwo
      : playerOne;

  const currentPlayerAccepted =
    isPlayerOne
      ? playerOneAccepted
      : playerTwoAccepted;

  const potentialGain = Math.floor(
    stake *
      2 *
      (
        100 - commissionRate
      ) /
      100
  );

  /*
   * Synchronisation après une acceptation.
   */
  useEffect(() => {
    if (!acceptState.success) {
      return;
    }

    setStatus(acceptState.status);
    router.refresh();
  }, [
    acceptState,
    router
  ]);

  /*
   * Synchronisation après le lancement
   * du délai des captures.
   */
  useEffect(() => {
    if (
      !evidenceState.success ||
      !evidenceState.evidenceDeadline
    ) {
      return;
    }

    setStatus(
      evidenceState.status
    );

    setEvidenceDeadline(
      evidenceState.evidenceDeadline
    );

    setRemainingSeconds(
      getRemainingSeconds(
        evidenceState.evidenceDeadline
      )
    );

    router.refresh();
  }, [
    evidenceState,
    router
  ]);

  /*
   * Compte à rebours réel basé sur la date
   * enregistrée dans PostgreSQL.
   */
  useEffect(() => {
    if (
      status !==
        "WAITING_FOR_EVIDENCE" ||
      !evidenceDeadline
    ) {
      return;
    }

    const updateTimer = () => {
      setRemainingSeconds(
        getRemainingSeconds(
          evidenceDeadline
        )
      );
    };

    updateTimer();

    const interval =
      window.setInterval(
        updateTimer,
        1000
      );

    return () => {
      window.clearInterval(interval);
    };
  }, [
    evidenceDeadline,
    status
  ]);

  /*
   * Surveillance en temps réel du match
   * et des captures envoyées.
   */
  useEffect(() => {
    const supabase = createClient();

    const matchChannel = supabase
      .channel(`match-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`
        },
        (payload) => {
          const updatedMatch =
            payload.new as MatchRealtimeData;

          setStatus(
            updatedMatch.status
          );

          setEvidenceDeadline(
            updatedMatch.evidence_deadline
          );

          if (
            [
              "COMPLETED",
              "UNFINISHED",
              "AI_REVIEW"
            ].includes(
              updatedMatch.status
            )
          ) {
            router.refresh();
          }
        }
      )
      .subscribe();

    const evidenceChannel = supabase
      .channel(
        `evidence-${matchId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_evidence",
          filter: `match_id=eq.${matchId}`
        },
        (payload) => {
          const evidence =
            payload.new as {
              user_id: string;
            };

          if (
            evidence.user_id ===
            currentUserId
          ) {
            setHasEvidence(true);
          } else {
            setOtherPlayerHasEvidence(
              true
            );
          }

          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        matchChannel
      );

      void supabase.removeChannel(
        evidenceChannel
      );
    };
  }, [
    currentUserId,
    matchId,
    router
  ]);

  async function uploadEvidence() {
    if (!selectedFile) {
      setUploadMessage(
        "Choisis une capture avant de l’envoyer."
      );

      return;
    }

    if (
      !selectedFile.type.startsWith(
        "image/"
      )
    ) {
      setUploadMessage(
        "Le fichier doit être une image."
      );

      return;
    }

    if (
      selectedFile.size >
      10 * 1024 * 1024
    ) {
      setUploadMessage(
        "La capture ne doit pas dépasser 10 Mo."
      );

      return;
    }

    setUploadPending(true);
    setUploadMessage("");

    const formData = new FormData();

    formData.set(
      "evidence",
      selectedFile
    );

    try {
      const response = await fetch(
        `/api/matches/${matchId}/evidence`,
        {
          method: "POST",
          body: formData
        }
      );

      const result =
        await response.json() as {
          success?: boolean;
          message?: string;
        };

      if (!response.ok) {
        setUploadMessage(
          result.message ??
            "Impossible d’envoyer la capture."
        );

        return;
      }

      setHasEvidence(true);

      setUploadMessage(
        result.message ??
          "Capture envoyée avec succès."
      );

      router.refresh();
    } catch {
      setUploadMessage(
        "Une erreur réseau empêche l’envoi."
      );
    } finally {
      setUploadPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span
          className={
            status === "COMPLETED"
              ? "status status--active"
              : status === "UNFINISHED"
                ? "status"
                : "status status--active"
          }
        >
          {status === "MATCHED" &&
            "Adversaire trouvé"}

          {status === "ACCEPTED" &&
            "Acceptation en attente"}

          {status === "IN_PROGRESS" &&
            "Match en cours"}

          {status ===
            "WAITING_FOR_EVIDENCE" &&
            "Captures attendues"}

          {status === "AI_REVIEW" &&
            "Analyse en cours"}

          {status === "COMPLETED" &&
            "Match terminé"}

          {status === "UNFINISHED" &&
            "Match inachevé"}
        </span>

        <h1>
          MATCH
          <br />
          <em>GOALX.</em>
        </h1>
      </header>

      <section className={styles.matchCard}>
        <div className={styles.players}>
          <Player
            player={currentPlayer}
            label="Toi"
            color="lime"
          />

          <div className={styles.versus}>
            <span>VS</span>

            <small>
              Division{" "}
              {currentPlayer.division}
            </small>
          </div>

          <Player
            player={opponent}
            label="Adversaire"
            color="blue"
          />
        </div>

        <div className={styles.matchInformation}>
          <div>
            <Gamepad2 />
            <span>Mode</span>
            <strong>
              {formatGameMode(gameMode)}
            </strong>
          </div>

          <div>
            <Swords />
            <span>Mise</span>
            <strong>
              {formatCredits(stake)} FCFA
            </strong>
          </div>

          <div>
            <Trophy />
            <span>Gain potentiel</span>
            <strong>
              {formatCredits(
                potentialGain
              )}{" "}
              FCFA
            </strong>
          </div>
        </div>
      </section>

      {(status === "MATCHED" ||
        status === "ACCEPTED") && (
        <section className={styles.actionCard}>
          <UserCheck />

          <div>
            <span>Confirmation du match</span>

            <h2>
              ACCEPTE LE DÉFI
            </h2>

            <p>
              Les deux joueurs doivent accepter
              avant de lancer eFootball.
            </p>
          </div>

          <form action={acceptFormAction}>
            <input
              type="hidden"
              name="match_id"
              value={matchId}
            />

            <button
              type="submit"
              className="button"
              disabled={
                acceptPending ||
                currentPlayerAccepted
              }
            >
              {acceptPending ? (
                <>
                  <LoaderCircle
                    className="spinner"
                  />
                  Acceptation
                </>
              ) : currentPlayerAccepted ? (
                <>
                  <CheckCircle2 />
                  Déjà accepté
                </>
              ) : (
                <>
                  <UserCheck />
                  Accepter le match
                </>
              )}
            </button>
          </form>

          {acceptState.message && (
            <p
              className={
                acceptState.success
                  ? "form-message form-message--success"
                  : "form-message form-message--error"
              }
            >
              {acceptState.message}
            </p>
          )}
        </section>
      )}

      {status === "IN_PROGRESS" && (
        <section className={styles.actionCard}>
          <Gamepad2 />

          <div>
            <span>Match eFootball</span>

            <h2>
              À VOUS DE JOUER
            </h2>

            <p>
              Ajoute l’adversaire avec son nom
              eFootball, joue le match, puis
              démarre l’envoi des preuves.
            </p>
