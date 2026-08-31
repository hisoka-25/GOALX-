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

type MatchmakingRpcResult = {
  queue_id: string | null;
  queue_status: string;
  found_match_id: string | null;
};

const stakeOptions = [
  500,
  1000,
  1500
];

const MIN_STAKE = 500;
const STAKE_STEP = 500;

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
    customStake,
    setCustomStake
  ] = useState<string>("");

  // La mise effective : la saisie personnalisée prime
  // sur les boutons rapides si elle est valide.
  const customStakeValue =
    customStake.trim() !== ""
      ? Number(customStake)
      : Number.NaN;

  const customStakeIsValid =
    Number.isSafeInteger(customStakeValue) &&
    customStakeValue >= MIN_STAKE &&
    customStakeValue % STAKE_STEP === 0;

  const effectiveStake = customStakeIsValid
    ? customStakeValue
    : selectedStake;

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
        effectiveStake * 2 * 0.90
      ),
    [effectiveStake]
  );

  const balanceIsSufficient =
    availableBalance >= effectiveStake;

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

    let requestInProgress = false;
    let effectIsActive = true;

    /*
     * Chaque contrôle relance le moteur SQL. Cette
     * réévaluation est indispensable pour élargir la
     * recherche du même pays vers la même zone après
     * le délai prévu, même si les deux joueurs sont
     * déjà présents dans la file.
     */
    async function reevaluateSearch() {
      if (
        requestInProgress ||
        !effectIsActive
      ) {
        return;
      }

      requestInProgress = true;

      const {
        data: rpcData,
        error: rpcError
      } = await supabase.rpc(
        "join_matchmaking",
        {
          requested_stake: effectiveStake
        }
      );

      if (
        !rpcError &&
        effectIsActive &&
        Array.isArray(rpcData) &&
        rpcData.length > 0
      ) {
        const result =
          rpcData[0] as MatchmakingRpcResult;

        if (
          result.queue_status === "MATCHED" &&
          result.found_match_id
        ) {
          processQueueUpdate({
            id:
              result.queue_id ??
              currentQueueId ??
              "",
            status: "MATCHED",
            match_id: result.found_match_id
          });

          requestInProgress = false;
          return;
        }
      }

      const {
        data: queueData
      } = await supabase
        .from("matchmaking_queue")
        .select(
          "id, status, match_id"
        )
        .eq("id", currentQueueId)
        .eq("user_id", userId)
        .maybeSingle();

      if (
        queueData &&
        effectIsActive
      ) {
        processQueueUpdate(
          queueData as QueueUpdate
        );
      }

      requestInProgress = false;
    }

    void reevaluateSearch();

    const pollingInterval =
      window.setInterval(
        () => {
          void reevaluateSearch();
        },
        5000
      );

    return () => {
      effectIsActive = false;

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
    effectiveStake,
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
          Choisis ta mise, lance la recherche et
          GOALX te trouve un adversaire prêt à
          te défier.
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
            value={effectiveStake}
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
                customStake.trim() === "" &&
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
                    setCustomStake("");
                    setLocalMessage("");
                    setLocalStatus("IDLE");
                  }}
                  aria-pressed={selected}
                >
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

          <div className={styles.customStake}>
            <label htmlFor="custom-stake">
              Ou personnalise ta mise
            </label>

            <div className={styles.customStakeField}>
              <input
                id="custom-stake"
                type="number"
                min={MIN_STAKE}
                step={STAKE_STEP}
                inputMode="numeric"
                placeholder="Ex : 2 000"
                value={customStake}
                disabled={joinPending || isSearching}
                onChange={(event) => {
                  setCustomStake(event.target.value);
                  setLocalMessage("");
                  setLocalStatus("IDLE");
                }}
              />
              <span>FCFA</span>
            </div>

            <small>
              Mise minimum 500 FCFA, par palier de 500.
            </small>

            {customStake.trim() !== "" &&
              !customStakeIsValid && (
                <p
                  className={styles.customStakeError}
                  role="alert"
                >
                  Saisis une mise valide (500 minimum,
                  multiple de 500).
                </p>
              )}
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
                effectiveStake * 2
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
            className="button button--full button--hero"
            disabled={
              joinPending ||
              !balanceIsSufficient ||
              (customStake.trim() !== "" &&
                !customStakeIsValid)
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
