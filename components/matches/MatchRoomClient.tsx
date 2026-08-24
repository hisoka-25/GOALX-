"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ClipboardCheck, Clock3, Gamepad2, ImageUp,
  LoaderCircle, Send, ShieldCheck, Swords, Trophy, UserCheck
} from "lucide-react";
import {
  acceptMatchAction,
  reportScoreAction,
  startEvidenceAction,
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
  currentUserHasReported: boolean;
  verdict: string | null;
  verdictExplanation: string | null;
  detectedScore: string | null;
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
  const [reported, setReported] = useState(props.currentUserHasReported);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [acceptState, acceptAction, accepting] = useActionState(acceptMatchAction, initialMatchActionState);
  const [evidenceState, evidenceAction, evidencePending] = useActionState(startEvidenceAction, initialMatchActionState);
  const [reportState, reportAction, reporting] = useActionState(reportScoreAction, initialMatchActionState);

  const isPlayerOne = props.currentUserId === props.playerOne.id;
  const me = isPlayerOne ? props.playerOne : props.playerTwo;
  const opponent = isPlayerOne ? props.playerTwo : props.playerOne;
  const alreadyAccepted = isPlayerOne ? props.playerOneAccepted : props.playerTwoAccepted;
  const potentialGain = Math.floor(props.stake * 2 * (100 - props.commissionRate) / 100);

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
    if (evidenceState.success && evidenceState.evidenceDeadline) {
      setStatus(evidenceState.status);
      setDeadline(evidenceState.evidenceDeadline);
      setRemaining(secondsLeft(evidenceState.evidenceDeadline));
      router.refresh();
    }
  }, [evidenceState, router]);

  useEffect(() => {
    if (reportState.success) {
      if (reportState.status === "CONFIRMED") {
        setStatus("COMPLETED");
      } else if (reportState.status === "DRAW_REFUND") {
        setStatus("UNFINISHED");
      } else if (reportState.status === "CONFLICT") {
        setStatus("WAITING_FOR_EVIDENCE");
      }

      if (
        reportState.status === "WAITING_OPPONENT" ||
        reportState.status === "CONFIRMED" ||
        reportState.status === "DRAW_REFUND" ||
        reportState.status === "CONFLICT"
      ) {
        setReported(true);
      }

      router.refresh();
    }
  }, [reportState, router]);

  useEffect(() => {
    if (status !== "WAITING_FOR_EVIDENCE" || !deadline) return;
    const update = () => setRemaining(secondsLeft(deadline));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [status, deadline]);

  useEffect(() => {
    if (["COMPLETED", "UNFINISHED"].includes(status)) return;
    const interval = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(interval);
  }, [router, status]);

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
        </section>
      )}

      {status === "IN_PROGRESS" && (
        <section className={styles.actionCard}>
          <Gamepad2 />
          <div>
            <span>Résultat du match</span>
            <h2>DÉCLARE LE SCORE</h2>
            <p>Saisis le score vu de ton côté. Si les deux déclarations concordent, le match est réglé immédiatement.</p>
          </div>

          {!reported ? (
            <form action={reportAction} className={styles.scoreForm}>
              <input type="hidden" name="match_id" value={props.matchId} />
              <div className={styles.scoreFields}>
                <label className={styles.scoreField}>
                  <span>Mes buts</span>
                  <input type="number" name="my_goals" inputMode="numeric" min={0} max={99} placeholder="0" required />
                </label>
                <span className={styles.scoreDash}>–</span>
                <label className={styles.scoreField}>
                  <span>Buts adverses</span>
                  <input type="number" name="opponent_goals" inputMode="numeric" min={0} max={99} placeholder="0" required />
                </label>
              </div>
              <button type="submit" className={`button ${styles.scoreSubmit}`} disabled={reporting}>
                {reporting ? <><LoaderCircle className="spinner" />Déclaration</> : <><Send />Déclarer le score</>}
              </button>
              <p className={styles.scoreNote}>Une seule déclaration possible. En cas de contradiction, des captures seront demandées.</p>
            </form>
          ) : (
            <div className={styles.reportPending}>
              <CheckCircle2 />
              <div>
                <strong>Score déclaré</strong>
                <span>En attente de la déclaration adverse. La page se met à jour automatiquement.</span>
              </div>
            </div>
          )}

          {reportState.message && <p className={reportState.success ? "form-message form-message--success" : "form-message form-message--error"}>{reportState.message}</p>}

          <div className={styles.opponentName}><span>Nom eFootball adverse</span><strong>{opponent.efootballUsername}</strong><small>Équipe : {opponent.team}</small></div>

          <form action={evidenceAction} className={styles.scoreFallback}>
            <input type="hidden" name="match_id" value={props.matchId} />
            <button type="submit" className={styles.ghostLink} disabled={evidencePending}>
              {evidencePending ? "Démarrage…" : "Le match est terminé — je préfère envoyer une capture"}
            </button>
          </form>
          {evidenceState.message && <p className={evidenceState.success ? "form-message form-message--success" : "form-message form-message--error"}>{evidenceState.message}</p>}
        </section>
      )}

      {status === "WAITING_FOR_EVIDENCE" && (
        <section className={styles.evidenceCard}>
          <div className={styles.evidenceHeading}>
            <div><span>Preuve du résultat</span><h2>ENVOIE TA CAPTURE</h2><p>Le score et les noms doivent être clairement visibles.</p></div>
            <div className={remaining <= 60 ? `${styles.timer} ${styles.timerDanger}` : styles.timer}><Clock3 /><span>Temps restant</span><strong>{timerLabel(remaining)}</strong></div>
          </div>
          <div className={styles.evidenceStates}>
            <span className={hasEvidence ? styles.evidenceReceived : undefined}>{hasEvidence ? <CheckCircle2 /> : <Clock3 />}Ta capture</span>
            <span className={props.opponentHasEvidence ? styles.evidenceReceived : undefined}>{props.opponentHasEvidence ? <CheckCircle2 /> : <Clock3 />}Capture adverse</span>
          </div>
          {!hasEvidence && remaining > 0 && (
            <div className={styles.upload}>
              <label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><ImageUp /><strong>{file?.name ?? "Choisir une capture"}</strong><span>PNG, JPG ou WEBP · 10 Mo maximum</span></label>
              <button type="button" className="button" onClick={uploadEvidence} disabled={uploading || !file}>{uploading ? <><LoaderCircle className="spinner" />Envoi</> : <><ImageUp />Envoyer la preuve</>}</button>
            </div>
          )}
          {hasEvidence && <div className={styles.uploadSuccess}><ShieldCheck /><div><strong>Capture enregistrée</strong><span>En attente de la preuve adverse ou du verdict.</span></div></div>}
          {uploadMessage && <div className={hasEvidence ? "form-message form-message--success" : "form-message form-message--error"}>{uploadMessage}</div>}
        </section>
      )}

      {status === "AI_REVIEW" && (
        <section className={styles.reviewCard}><div className={styles.aiAnimation}><ClipboardCheck /><i /></div><span className="status status--active">Vérification en cours</span><h2>CONTRÔLE DES PREUVES</h2><p>Le score, les noms et la cohérence des captures sont en cours de vérification.</p></section>
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
    <div className={color === "blue" ? `${styles.playerAvatar} ${styles.playerAvatarBlue}` : styles.playerAvatar}>{player.username.charAt(0).toUpperCase() || "G"}</div>
    <strong>{player.username}</strong><small>{player.efootballUsername}</small>
  </div>;
  }
