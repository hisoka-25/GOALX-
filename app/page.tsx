import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  Gamepad2,
  Menu,
  ShieldCheck,
  Swords,
  Trophy,
  Wallet
} from "lucide-react";

import { Logo } from "@/components/Logo";

import styles from "./page.module.css";

const steps = [
  {
    number: "01",
    icon: Swords,
    title: "Trouve ton adversaire",
    description:
      "Choisis ta mise. GOALX recherche en priorité un joueur de ton niveau et proche de ta zone de jeu."
  },
  {
    number: "02",
    icon: Gamepad2,
    title: "Dispute le match",
    description:
      "Retrouve ton adversaire dans eFootball et joue le match selon les informations affichées dans ton espace."
  },
  {
    number: "03",
    icon: FileCheck2,
    title: "Confirme le résultat",
    description:
      "Envoie une capture claire du score dans les cinq minutes afin de permettre la validation du résultat."
  }
];

const rules = [
  "10 000 FCFA de crédits fictifs à l’inscription",
  "Matchmaking par mode de jeu, division, mise et proximité",
  "Commission de 10 % uniquement sur un match gagné",
  "Restitution des mises lorsque le match est déclaré inachevé"
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Logo />

        <nav
          className={styles.navigation}
          aria-label="Navigation principale"
        >
          <a href="#fonctionnement">Fonctionnement</a>
          <a href="#validation">Validation</a>
          <a href="#regles">Règles</a>
        </nav>

        <div className={styles.headerActions}>
          <Link
            href="/login"
            className={styles.loginLink}
          >
            Connexion
          </Link>

          <Link
            href="/register"
            className="button"
          >
            Créer un compte
          </Link>
        </div>

        <button
          type="button"
          className={styles.mobileMenu}
          aria-label="Ouvrir le menu"
        >
          <Menu />
        </button>
      </header>

      <section className={styles.hero}>
        <div
          className={styles.heroLights}
          aria-hidden="true"
        />

        <div className={styles.heroContent}>
          <span className="eyebrow">
            Compétition eFootball
          </span>

          <h1 className={styles.heroTitle}>
            Aucune
            <br />
            excuse.
            <br />
            <em>Joue.</em>
          </h1>

          <p className={styles.heroText}>
            Affronte des joueurs de ton niveau,
            engage tes crédits de compétition et
            impose ton jeu. Sur GOALX, chaque
            résultat compte.
          </p>

          <div className={styles.heroActions}>
            <Link
              href="/register"
              className="button"
            >
              Entrer dans l’arène
              <ArrowRight />
            </Link>

            <a
              href="#fonctionnement"
              className="button button--secondary"
            >
              Découvrir GOALX
            </a>
          </div>

          <div className={styles.trust}>
            <span>
              <ShieldCheck />
              Crédits protégés
            </span>

            <span>
              <BadgeCheck />
              Résultats vérifiés
            </span>

            <span>
              <Gamepad2 />
              Quatre modes de jeu
            </span>
          </div>
        </div>

        <div className={styles.welcomeCredits}>
          <span>Crédits offerts</span>

          <strong>
            10 000
            <small> FCFA</small>
          </strong>
        </div>
      </section>

      <div className={styles.ticker}>
        <div>
          <span>Joue pour la victoire</span>
          <i>◆</i>
          <span>Affronte ta division</span>
          <i>◆</i>
          <span>Confirme ton résultat</span>
          <i>◆</i>
          <span>Progresse match après match</span>
        </div>
      </div>

      <section
        id="fonctionnement"
        className="page-section"
      >
        <div className="container">
          <div className="page-heading">
            <span className="eyebrow">
              Comment ça marche
            </span>

            <h2 className="display-title">
              Trois étapes.
              <br />
              <em>Un objectif.</em>
            </h2>

            <p className="page-description">
              GOALX organise la rencontre entre deux
              joueurs. Le match se dispute directement
              dans eFootball.
            </p>
          </div>

          <div className={styles.steps}>
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <article
                  className={styles.step}
                  key={step.number}
                >
                  <span className={styles.stepNumber}>
                    {step.number}
                  </span>

                  <span className={styles.stepIcon}>
                    <Icon />
                  </span>

                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="validation"
        className={styles.verdictSection}
      >
        <div className={styles.verdictContent}>
          <span className="eyebrow">
            Un résultat contrôlé
          </span>

          <h2 className="display-title">
            Une preuve claire.
            <br />
            <em>Une décision.</em>
          </h2>

          <p className="page-description">
            Les captures disponibles sont contrôlées
            avant le règlement définitif du match. Un
            joueur ne peut pas bloquer une décision en
            refusant d’envoyer sa preuve.
          </p>

          <div className={styles.verdictPoints}>
            <span>
              <CheckCircle2 />
              Capture à envoyer sous cinq minutes
            </span>

            <span>
              <CheckCircle2 />
              Une capture claire peut permettre le verdict
            </span>

            <span>
              <CheckCircle2 />
              Sans preuve, le match reste inachevé
            </span>
          </div>
        </div>

        <div className={styles.verdictCard}>
          <div className={styles.verdictHeader}>
            <span>Résultat du match</span>
            <span className="status status--active">
              Validé
            </span>
          </div>

          <div className={styles.score}>
            <div className={styles.competitor}>
              <span className={styles.avatar}>K</span>
              <strong>KADER_X</strong>
              <small>Division 4</small>
            </div>

            <div className={styles.scoreValue}>
              <strong>3</strong>
              <span>—</span>
              <strong>1</strong>
            </div>

            <div className={styles.competitor}>
              <span
                className={`${styles.avatar} ${styles.avatarBlue}`}
              >
                M
              </span>
              <strong>MOUSSA10</strong>
              <small>Division 4</small>
            </div>
          </div>

          <div className={styles.winner}>
            <Trophy />
            <span>Victoire de KADER_X</span>
            <strong>+900 FCFA</strong>
          </div>
        </div>
      </section>

      <section
        id="regles"
        className={styles.rulesSection}
      >
        <div className={styles.rulesCard}>
          <div>
            <span className="eyebrow">
              Règles transparentes
            </span>

            <h2>
              DES CRÉDITS DE COMPÉTITION.
              <br />
              DES RÈGLES CLAIRES.
            </h2>

            <p>
              Les crédits actuels sont fictifs et sans
              valeur monétaire. Ils permettent de tester
              l’intégralité de l’expérience compétitive
              GOALX.
            </p>
          </div>

          <ul>
            {rules.map((rule) => (
              <li key={rule}>
                <CheckCircle2 />
                {rule}
              </li>
            ))}
          </ul>

          <div
            className={styles.walletIcon}
            aria-hidden="true"
          >
            <Wallet />
          </div>
        </div>
      </section>

      <section className={styles.callToAction}>
        <div>
          <span>Le prochain match t’attend</span>
          <h2>ENTRE DANS L’ARÈNE.</h2>
          <p>
            Crée ton profil et reçois tes premiers
            crédits de compétition.
          </p>
        </div>

        <Link
          href="/register"
          className={`button ${styles.darkButton}`}
        >
          Créer mon compte
          <ArrowRight />
        </Link>
      </section>

      <footer className={styles.footer}>
        <Logo />

        <p>
          La compétition eFootball nouvelle génération.
        </p>

        <span>
          © 2026 GOALX — Crédits fictifs sans valeur
          monétaire.
        </span>
      </footer>
    </main>
  );
      }
