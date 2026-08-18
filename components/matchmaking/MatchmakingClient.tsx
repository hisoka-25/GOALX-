"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition
} from "react";

import { useRouter } from "next/navigation";

import {
  AlertTriangle,
  Gamepad2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  X
} from "lucide-react";

import {
  cancelMatchmakingAction,
  joinMatchmakingAction,
  type MatchmakingState
} from "@/app/(player)/matchmaking/actions";

import { createClient } from "@/lib/supabase/client";

import styles from "./MatchmakingClient.module.css";

type MatchmakingClientProps = {
  userId: string;
  username: string;
  division: number;
  gameMode: string;
  availableBalance: number;
  initialQueueId: string | null;
  initialStatus: string | null;
  initialMatchId: string | null;
  initialStake: number | null;
};

type QueueUpdate = {
  id: string;
  status: string;
  match_id: string | null;
};

const stakeOptions = [
  500,
  1000,
  2000,
  5000
];

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
const initialMatchmakingState: MatchmakingState = {
  success: false,
  status: "IDLE",
  message: "",
  queueId: null,
  matchId: null
};
export function MatchmakingClient({
  userId,
  username,
  division,
  gameMode,
  availableBalance,
  initialQueueId,
  initialStatus,
  initialMatchId,
  initialStake
}: MatchmakingClientProps) {
  const router = useRouter();

  const [
    state,
    formAction,
    joinPending
  ] = useActionState<
    MatchmakingState,
    FormData
  >(
    joinMatchmakingAction,
    {
      ...initialMatchmakingState,
      success:
        initialStatus === "SEARCHING" ||
        initialStatus === "MATCHED",
      status:
        initialStatus === "SEARCHING"
          ? "SEARCHING"
          : initialStatus === "MATCHED"
            ? "MATCHED"
            : "IDLE",
      message:
        initialStatus === "SEARCHING"
          ? "Recherche en cours. GOALX cherche un adversaire compatible."
          : initialStatus === "MATCHED"
            ? "Adversaire trouvé !"
            : "",
      queueId: initialQueueId,
      matchId: initialMatchId
    }
  );

  const [
    selectedStake,
    setSelectedStake
  ] = useState(
    initialStake &&
      stakeOptions.includes(initialStake)
      ? initialStake
      : 500
  );

  const [
    localStatus,
    setLocalStatus
  ] = useState(state.status);

  const [
    localMessage,
    setLocalMessage
  ] = useState(state.message);

  const [
    currentQueueId,
    setCurrentQueueId
  ] = useState(state.queueId);

  const [
    cancelling,
    startCancellation
  ] = useTransition();

  const potentialGain = useMemo(
    () =>
      Math.floor(
        selectedStake * 2 * 0.9
      ),
    [selectedStake]
  );

  const balanceIsSufficient =
    availableBalance >= selectedStake;

  const isSearching =
    localStatus === "SEARCHING";

  /*
   * Synchronisation avec le résultat de la Server Action.
   */
  useEffect(() => {
    setLocalStatus(state.status);
    setLocalMessage(state.message);
    setCurrentQueueId(state.queueId);

    if (
      state.status === "MATCHED" &&
      state.matchId
    ) {
      router.push(
        `/matches/${state.matchId}`
      );
    }
  }, [state, router]);

  /*
   * Surveillance en temps réel de la file Supabase.
   */
  useEffect(() => {
    if (
      !isSearching ||
      !currentQueueId
    ) {
      return;
    }

    const supabase = createClient();

    function processQueueUpdate(
      queue: QueueUpdate
    ) {
      if (
        queue.status === "MATCHED" &&
        queue.match_id
      ) {
        setLocalStatus("MATCHED");
        setLocalMessage(
          "Adversaire trouvé !"
        );

        router.push(
          `/matches/${queue.match_id}`
        );
      }

      if (
        queue.status === "CANCELLED"
      ) {
        setLocalStatus("CANCELLED");
        setLocalMessage(
          "La recherche a été annulée."
        );
      }
    }

    const channel = supabase
      .channel(
        `matchmaking-${currentQueueId}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matchmaking_queue",
          filter: `id=eq.${currentQueueId}`
        },
        (payload) => {
          processQueueUpdate(
            payload.new as QueueUpdate
          );
        }
      )
      .subscribe();

    /*
     * Le contrôle périodique sert de secours si
     * le réseau temps réel est interrompu.
     */
    const pollingInterval =
      window.setInterval(async () => {
        const {
          data
        } = await supabase
          .from("matchmaking_queue")
          .select(
            "id, status, match_id"
          )
          .eq("id", currentQueueId)
          .eq("user_id", userId)
          .maybeSingle();

        if (data) {
          processQueueUpdate(
            data as QueueUpdate
          );
        }
      }, 3000);

    return () => {
      window.clearInterval(
        pollingInterval
      );

      void supabase.removeChannel(
        channel
      );
    };
  }, [
    currentQueueId,
    isSearching,
    router,
    userId
  ]);

  function handleCancellation() {
    startCancellation(async () => {
      const result =
        await cancelMatchmakingAction();

      setLocalStatus(result.status);
      setLocalMessage(result.message);
      setCurrentQueueId(null);

      router.refresh();
    });
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Matchmaking
        </span>

        <h1>
          TROUVE TON
          <br />
          <em>ADVERSAIRE.</em>
        </h1>

        <p>
          GOALX recherche un joueur avec le
          même mode de jeu, la même division
          et la même mise.
        </p>
      </header>

      <section className={styles.playerSummary}>
        <div className={styles.avatar}>
          {username
            .trim()
            .charAt(0)
            .toUpperCase() || "G"}
        </div>

        <div>
          <span>Profil recherché</span>

          <strong>{username}</strong>

          <small>
            Division {division}
          </small>
        </div>

        <div className={styles.mode}>
          <Gamepad2 />

          <span>Mode</span>

          <strong>
            {formatGameMode(gameMode)}
          </strong>
        </div>
      </section>

      {!isSearching ? (
        <form
          action={formAction}
          className={styles.form}
        >
          <input
            type="hidden"
            name="stake"
            value={selectedStake}
          />

          <div className={styles.sectionTitle}>
            <div>
              <span>Étape 1</span>
              <h2>CHOISIS TA MISE</h2>
            </div>

            <WalletBalance
              balance={availableBalance}
            />
          </div>

          <div className={styles.stakes}>
            {stakeOptions.map((stake) => {
              const selected =
                selectedStake === stake;

              const disabled =
                availableBalance < stake;

              return (
                <button
                  type="button"
                  key={stake}
                  className={
                    selected
                      ? `${styles.stake} ${styles.stakeSelected}`
                      : styles.stake
                  }
                  disabled={disabled}
                  onClick={() => {
                    setSelectedStake(stake);
                    setLocalMessage("");
                    setLocalStatus("IDLE");
                  }}
                  aria-pressed={selected}
                >
                  <span>Mise</span>

                  <strong>
                    {formatCredits(stake)}
                  </strong>

                  <small>FCFA</small>

                  {selected && (
                    <i>Choisie</i>
                  )}
                </button>
              );
            })}
          </div>

          <div className={styles.gain}>
            <div>
              <Trophy />
              <span>
                Ton gain potentiel
              </span>
            </div>

            <strong>
              {formatCredits(
                potentialGain
              )}{" "}
              FCFA
            </strong>

            <small>
              Pot de{" "}
              {formatCredits(
                selectedStake * 2
              )}{" "}
              FCFA · Commission GOALX 10 %
            </small>
          </div>

          {localMessage && (
            <div
              className={
                localStatus === "ERROR"
                  ? "form-message form-message--error"
                  : "form-message form-message--success"
              }
              role="alert"
            >
              {localMessage}
            </div>
          )}

          {!balanceIsSufficient && (
            <div
              className={styles.warning}
              role="alert"
            >
              <AlertTriangle />

              Ton solde est insuffisant
              pour cette mise.
            </div>
          )}

          <button
            type="submit"
            className="button button--full"
            disabled={
              joinPending ||
              !balanceIsSufficient
            }
          >
            {joinPending ? (
              <>
                <LoaderCircle
                  className="spinner"
                />
                Lancement de la recherche
              </>
            ) : (
              <>
                <Search />
                Trouver un adversaire
              </>
            )}
          </button>

          <p className={styles.securityNote}>
            <ShieldCheck />
            Les crédits seront réservés
            uniquement lorsqu’un adversaire
            aura été trouvé.
          </p>
        </form>
      ) : (
        <section className={styles.searching}>
          <div
            className={styles.radar}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <Swords />
          </div>

          <span className="status status--active">
            Recherche active
          </span>

          <h2>
            RECHERCHE EN COURS
          </h2>

          <p>{localMessage}</p>

          <dl className={styles.searchParameters}>
            <div>
              <dt>Mise</dt>
              <dd>
                {formatCredits(
                  selectedStake
                )}{" "}
                FCFA
              </dd>
            </div>

            <div>
              <dt>Division</dt>
              <dd>{division}</dd>
            </div>

            <div>
              <dt>Mode</dt>
              <dd>
                {formatGameMode(
                  gameMode
                )}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            className="button button--secondary"
            onClick={handleCancellation}
            disabled={cancelling}
          >
            {cancelling ? (
              <>
                <LoaderCircle
                  className="spinner"
                />
                Annulation
              </>
            ) : (
              <>
                <X />
                Annuler la recherche
              </>
            )}
          </button>

          <small className={styles.searchHelp}>
            Tu peux garder cette page ouverte.
            GOALX te redirigera automatiquement
            dès qu’un adversaire sera trouvé.
          </small>
        </section>
      )}
    </div>
  );
}

function WalletBalance({
  balance
}: {
  balance: number;
}) {
  return (
    <div className={styles.balance}>
      <span>Solde disponible</span>

      <strong>
        {formatCredits(balance)}
        <small> FCFA</small>
      </strong>
    </div>
  );
    }
