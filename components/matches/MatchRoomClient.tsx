"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ClipboardCheck, Clock3, Gamepad2, ImageUp,
  LoaderCircle, Send, ShieldCheck, Swords, Trophy, UserCheck, UserPlus
} from "lucide-react";
import {
  acceptMatchAction,
  reportOutcomeAction,
  type MatchActionState
} from "@/app/(player)/matches/actions";
import styles from "./MatchRoomClient.module.css";

type PlayerData = {
  id: string;
  username: string;
  efootballUsername: string;
  team: string;
  division: number;
};

type Props = {
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
  currentUserOutcome: string | null;
  opponentOutcome: string | null;
  verdict: string | null;
  verdictExplanation: string | null;
  detectedScore: string | null;
  inviterIsPlayerOne: boolean;
};

const credits = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
const modeLabel = (mode: string) => ({ MOBILE: "Mobile", PLAYSTATION: "PlayStation", XBOX: "Xbox", PC: "PC" }[mode] ?? mode);
const secondsLeft = (deadline: string | null) => deadline ? Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)) : 0;
const timerLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const initialMatchActionState: MatchActionState = {
  success: false,
  status: "IDLE",
  message: "",
  evidenceDeadline: null
};

export function MatchRoomClient(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(props.initialStatus);
  const [deadline, setDeadline] = useState(props.initialEvidenceDeadline);
  const [remaining, setRemaining] = useState(secondsLeft(props.initialEvidenceDeadline));
  const [hasEvidence, setHasEvidence] = useState(props.currentUserHasEvidence);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [myOutcome, setMyOutcome] = useState(props.currentUserOutcome);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [acceptState, acceptAction, accepting] = useActionState(acceptMatchAction, initialMatchActionState);
  const [outcomeState, outcomeAction, outcomePending] = useActionState(reportOutcomeAction, initialMatchActionState);

  const isPlayerOne = props.currentUserId === props.playerOne.id;
  const me = isPlayerOne ? props.playerOne : props.playerTwo;
  const opponent = isPlayerOne ? props.playerTwo : props.playerOne;
  const alreadyAccepted = isPlayerOne ? props.playerOneAccepted : props.playerTwoAccepted;
  const potentialGain = Math.floor(props.stake * 2 * (100 - props.commissionRate) / 100);

  // Celui qui envoie l'invitation eFootball est déterminé par le serveur
  // (hôte du match amical). playerOne = le joueur qui attendait / créateur.
  const iAmInviter =
    (props.inviterIsPlayerOne && isPlayerOne) ||
    (!props.inviterIsPlayerOne && !isPlayerOne);

  /* Le statut serveur est la source de vérité :
     cela permet au joueur qui attend de voir le match
     se régler sans recharger la page. */
  useEffect(() => {
    setStatus(props.initialStatus);
  }, [props.initialStatus]);

  useEffect(() => {
    if (props.initialEvidenceDeadline) {
      setDeadline(props.initialEvidenceDeadline);
      setRemaining(secondsLeft(props.initialEvidenceDeadline));
    }
  }, [props.initialEvidenceDeadline]);

  useEffect(() => {
    if (acceptState.success) {
      setStatus(acceptState.status);
      router.refresh();
    }
  }, [acceptState, router]);

  useEffect(() => {
    if (outcomeState.success) {
      if (outcomeState.status === "CONFIRMED") {
        setStatus("COMPLETED");
      } else if (outcomeState.status === "CONFLICT") {
        setStatus("AI_REVIEW");
      }

      router.refresh();
    }
  }, [outcomeState, router]);

  /* Les déclarations du serveur sont la source de vérité. */
  useEffect(() => {
    setMyOutcome(props.currentUserOutcome);
  }, [props.currentUserOutcome]);

  useEffect(() => {
    if (status !== "WAITING_FOR_EVIDENCE" || !deadline) return;
    const update = () => setRemaining(secondsLeft(deadline));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [status, deadline]);

  useEffect(() => {
    if (["COMPLETED", "UNFINISHED", "CANCELLED"].includes(status)) return;
    let cancelled = false;

    // Demande au serveur d'auto-régler le match (litige IA ou forfait
    // après le délai) puis rafraîchit l'affichage.
    const tick = async () => {
      try {
        const resp = await fetch(
          `/api/matches/${props.matchId}/auto-resolve`,
          { method: "POST", cache: "no-store" }
        );
        const data: { message?: string; status?: string } = await resp.json().catch(() => ({}));
        // Garde l'erreur seulement si on reste bloqué en vérification.
        if (!cancelled) {
          const isWait = data?.message?.includes("dans ~1 min");
          if (data?.message && data?.status === "AI_REVIEW" && !isWait) {
            setVerifyError(data.message);
          } else if (isWait) {
            // On garde l'erreur précédente mais sans spammer.
          } else {
            setVerifyError(null);
          }
        }
      } catch {
        /* On réessaie au prochain tick. */
      }
      if (!cancelled) router.refresh();
    };

    const interval = window.setInterval(tick, 5000);
    // Un appel rapide au montage pour traiter un forfait/litige déjà mûr.
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [router, status, props.matchId]);

  async function uploadEvidence() {
    if (!file) return setUploadMessage("Choisis une capture.");
    if (!file.type.startsWith("image/")) return setUploadMessage("Le fichier doit être une image.");
    if (file.size > 10 * 1024 * 1024) return setUploadMessage("La capture ne doit pas dépasser 10 Mo.");
    setUploading(true);
    setUploadMessage("");
    const body = new FormData();
    body.set("evidence", file);
    try {
      const response = await fetch(`/api/matches/${props.matchId}/evidence`, { method: "POST", body });
      const result = await response.json() as { message?: string };
      setUploadMessage(result.message ?? (response.ok ? "Capture enregistrée." : "Échec de l’envoi."));
      if (response.ok) {
        setHasEvidence(true);
        router.refresh();
      }
    } catch {
      setUploadMessage("Une erreur réseau empêche l’envoi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="status status--active">
          {status === "MATCHED" && "Adversaire trouvé"}
          {status === "ACCEPTED" && "Acceptation en attente"}
          {status === "IN_PROGRESS" && "Match en cours"}
          {status === "WAITING_FOR_EVIDENCE" && "Captures attendues"}
          {status === "AI_REVIEW" && "Analyse en cours"}
          {status === "COMPLETED" && "Match terminé"}
          {status === "UNFINISHED" && "Match inachevé"}
        </span>
        <h1>MATCH<br /><em>GOALX.</em></h1>
      </header>

      <section className={styles.matchCard}>
        <div className={styles.players}>
          <Player player={me} label="Toi" color="lime" />
          <div className={styles.versus}><span>VS</span><small>Division {me.division}</small></div>
          <Player player={opponent} label="Adversaire" color="blue" />
        </div>
        <div className={styles.matchInformation}>
          <div><Gamepad2 /><span>Mode</span><strong>{modeLabel(props.gameMode)}</strong></div>
          <div><Swords /><span>Mise</span><strong>{credits(props.stake)} FCFA</strong></div>
          <div><Trophy /><span>Gain potentiel</span><strong>{credits(potentialGain)} FCFA</strong></div>
        </div>
      </section>

      {(status === "MATCHED" || status === "ACCEPTED") && (
        <section className={styles.actionCard}>
          <UserCheck />
          <div><span>Confirmation du match</span><h2>ACCEPTE LE DÉFI</h2><p>Les deux joueurs doivent accepter avant de lancer eFootball.</p></div>
          <form action={acceptAction}>
            <input type="hidden" name="match_id" value={props.matchId} />
            <button type="submit" className="button" disabled={accepting || alreadyAccepted}>
              {accepting ? <><LoaderCircle className="spinner" />Acceptation</> : alreadyAccepted ? <><CheckCircle2 />Déjà accepté</> : <><UserCheck />Accepter le match</>}
            </button>
          </form>
          {acceptState.message && <p className={acceptState.success ? "form-message form-message--success" : "form-message form-message--error"}>{acceptState.message}</p>}

          <div className={styles.inviteBox}>
            <UserPlus />
            <div>
              <span>Rendez-vous eFootball</span>
              {iAmInviter ? (
                <>
                  <strong>C'est toi qui envoies l'invitation.</strong>
                  <p>
                    Quand vous avez tous les deux accepté, ouvre eFootball,
                    crée un match amical en ligne et envoie une invitation
                    au nom eFootball de <strong>{opponent.efootballUsername}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <strong>En attente de l'invitation.</strong>
                  <p>
                    C'est <strong>{opponent.efootballUsername}</strong> qui
                    crée le match amical et t'envoie l'invitation dans eFootball.
                    Accepte-la dès qu'elle arrive.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {(status === "IN_PROGRESS" || status === "WAITING_FOR_EVIDENCE") && (
        <section className={styles.actionCard}>
          <Gamepad2 />
          <div>
            <span>Résultat du match</span>
            <h2>ENVOIE TA CAPTURE</h2>
            <p>
              Envoie la capture d'écran de fin de match (score et noms d'équipes bien visibles). Le chrono de 5 minutes démarre dès ta capture : sans preuve adverse à la fin, c'est forfait pour lui.
            </p>
          </div>

          {/* Envoi de la capture (seule action demandée au joueur). */}
          {!hasEvidence && (
            <div className={styles.upload}>
              <label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <ImageUp />
                <strong>{file?.name ?? "Choisir ta capture de résultat"}</strong>
                <span>PNG, JPG ou WEBP · 10 Mo max · score et noms d'équipes visibles</span>
              </label>
              <button
                type="button"
                className="button"
                onClick={uploadEvidence}
                disabled={uploading || !file}
              >
                {uploading ? (
                  <><LoaderCircle className="spinner" />Envoi…</>
                ) : (
                  <><ImageUp />Envoyer la capture</>
                )}
              </button>
              {uploadMessage && (
                <div className="form-message form-message--error">{uploadMessage}</div>
              )}
            </div>
          )}


          <div className={styles.opponentName}><span>Équipe adverse</span><strong>{opponent.team || opponent.username}</strong><small>Nom eFootball : {opponent.efootballUsername}</small></div>
        </section>
      )}

      {(status === "IN_PROGRESS" || status === "WAITING_FOR_EVIDENCE") && (
        <section className={styles.evidenceCard}>
          <div className={styles.evidenceHeading}>
            <div><span>Preuve du résultat</span><h2>SUIVI DES CAPTURES</h2><p>Les deux joueurs doivent envoyer leur capture.</p></div>
            <div className={remaining <= 60 ? `${styles.timer} ${styles.timerDanger}` : styles.timer}><Clock3 /><span>Temps restant</span><strong>{deadline ? timerLabel(remaining) : "—"}</strong></div>
          </div>
          <div className={styles.evidenceStates}>
            <span className={hasEvidence ? styles.evidenceReceived : undefined}>{hasEvidence ? <CheckCircle2 /> : <Clock3 />}Ta capture</span>
            <span className={props.opponentHasEvidence ? styles.evidenceReceived : undefined}>{props.opponentHasEvidence ? <CheckCircle2 /> : <Clock3 />}Capture adverse</span>
            <span className={myOutcome ? styles.evidenceReceived : undefined}>{myOutcome ? <CheckCircle2 /> : <Clock3 />}Ta déclaration</span>
            <span className={props.opponentOutcome ? styles.evidenceReceived : undefined}>{props.opponentOutcome ? <CheckCircle2 /> : <Clock3 />}Déclaration adverse</span>
          </div>
        </section>
      )}

      {hasEvidence && (status === "IN_PROGRESS" || status === "WAITING_FOR_EVIDENCE" || status === "AI_REVIEW") && (
        <section className={styles.actionCard}>
          <ClipboardCheck />
          <div>
            <span>Résultat du match</span>
            <h2>{status === "AI_REVIEW" ? "METTEZ-VOUS D'ACCORD" : "DÉCLARE TON RÉSULTAT"}</h2>
            <p>
              {status === "AI_REVIEW"
                ? "Les déclarations actuelles se contredisent. Si vous vous mettez d'accord ci-dessous, le match est réglé immédiatement — sinon l'arbitrage (IA ou administrateur) tranchera avec les captures."
                : "Si votre adversaire confirme le même résultat, le match est réglé immédiatement, sans vérification. En cas de contradiction, les captures départageront."}
            </p>
          </div>

          <div className={styles.declareStates}>
            <span className={myOutcome ? styles.evidenceReceived : undefined}>
              {myOutcome ? <CheckCircle2 /> : <Clock3 />}
              Toi : {myOutcome ? (myOutcome === "WON" ? "j'ai gagné" : "j'ai perdu") : "pas encore déclaré"}
            </span>
            <span className={props.opponentOutcome ? styles.evidenceReceived : undefined}>
              {props.opponentOutcome ? <CheckCircle2 /> : <Clock3 />}
              Adversaire : {props.opponentOutcome ? (props.opponentOutcome === "WON" ? "a déclaré avoir gagné" : "a déclaré avoir perdu") : "pas encore déclaré"}
            </span>
          </div>

          <div className={styles.declareRow}>
            <form action={outcomeAction}>
              <input type="hidden" name="match_id" value={props.matchId} />
              <input type="hidden" name="outcome" value="WON" />
              <button
                type="submit"
                className={`button ${myOutcome === "WON" ? styles.buttonActive : ""}`}
                disabled={outcomePending}
                onClick={() => setMyOutcome("WON")}
              >
                {outcomePending ? <LoaderCircle className="spinner" /> : <Trophy />}J'ai gagné
              </button>
            </form>
            <form action={outcomeAction}>
              <input type="hidden" name="match_id" value={props.matchId} />
              <input type="hidden" name="outcome" value="LOST" />
              <button
                type="submit"
                className={`button ${styles.buttonLost} ${myOutcome === "LOST" ? styles.buttonActive : ""}`}
                disabled={outcomePending}
                onClick={() => setMyOutcome("LOST")}
              >
                {outcomePending ? <LoaderCircle className="spinner" /> : <Swords />}J'ai perdu
              </button>
            </form>
          </div>

          {outcomeState.message && (
            <div className={outcomeState.success ? "form-message form-message--success" : "form-message form-message--error"}>
              {outcomeState.message}
            </div>
          )}
        </section>
      )}

      {status === "AI_REVIEW" && (
        <section className={styles.reviewCard}><div className={styles.aiAnimation}><ClipboardCheck /><i /></div><span className="status status--active">Vérification en cours</span><h2>CONTRÔLE DES PREUVES</h2><p>Le score, les noms et la cohérence des captures sont en cours de vérification.</p>{verifyError && <p style={{marginTop:12,color:'#ff9c9c',fontSize:'0.75rem',wordBreak:'break-word'}}>Détail : {verifyError}</p>}</section>
      )}

      {(status === "COMPLETED" || status === "UNFINISHED") && (
        <section className={status === "COMPLETED" ? styles.verdictCard : `${styles.verdictCard} ${styles.unfinished}`}>
          {status === "UNFINISHED" ? <ShieldCheck /> : props.winnerId === props.currentUserId ? <Trophy /> : <Swords />}
          <span>Verdict final</span>
          <h2>{status === "UNFINISHED" ? "MATCH INACHEVÉ" : props.winnerId === props.currentUserId ? "VICTOIRE" : "DÉFAITE"}</h2>
          {props.detectedScore && <strong>Score détecté : {props.detectedScore}</strong>}
          <p>{props.verdictExplanation ?? (status === "UNFINISHED" ? "Chaque joueur récupère sa mise." : "Le résultat a été validé.")}</p>
          {status === "COMPLETED" && props.winnerId === props.currentUserId && <div className={styles.payout}>+{credits(potentialGain)} FCFA</div>}
          {status === "UNFINISHED" && <div className={styles.payout}>Mise restituée</div>}
          {props.verdict && <small>Décision : {props.verdict}</small>}
        </section>
      )}

    </div>
  );
}

function Player({ player, label, color }: { player: PlayerData; label: string; color: "lime" | "blue" }) {
  return <div className={styles.player}>
    <span>{label}</span>
    <div className={color === "blue" ? `${styles.playerAvatar} ${styles.playerAvatarBlue}` : styles.playerAvatar}>{(player.team || player.username || "G").charAt(0).toUpperCase()}</div>
    <strong>{player.team || player.username}</strong><small>{player.efootballUsername}</small>
  </div>;
}
