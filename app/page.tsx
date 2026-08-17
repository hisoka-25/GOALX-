import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
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
      "Choisis ta mise. GOALX recherche un joueur utilisant le même mode de jeu, avec une division compatible."
  },
  {
    number: "02",
    icon: Gamepad2,
    title: "Dispute le match",
    description:
      "Les noms eFootball sont communiqués après l’acceptation. Lancez ensuite votre match dans le jeu."
  },
  {
    number: "03",
    icon: Bot,
    title: "Envoie ta preuve",
    description:
      "Chaque joueur dispose de cinq minutes pour envoyer sa capture. L’intelligence artificielle rend le verdict."
  }
];

const rules = [
  "10 000 FCFA de crédits fictifs à l’inscription",
  "Matchmaking par mode de jeu, division et mise",
  "Commission de 10 % uniquement sur un match gagné",
  "Restitution des mises si le match est inachevé"
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
          <a href="#fonctionnement">
            Fonctionnement
          </a>

          <a href="#verdict">
            Verdict IA
          </a>

          <a href="#regles">
            Règles
          </a>
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
        <div className={styles.heroLights} />

        <div className={styles.pitchLines}>
          <span />
          <span />
          <span />
        </div>

        <div className={styles.player}>
          <div className={styles.playerHead} />
          <div className={styles.playerBody}>
            <span className={styles.playerNumber}>
              X
            </span>
          </div>
          <div className={styles.playerLegs} />
        </div>

        <div className={styles.heroContent}>
          <span className="eyebrow">
            L’arène des joueurs eFootball
          </span>

          <h1 className={styles.heroTitle}>
            Défie.
            <br />
            <em>Joue.</em>
            <br />
            Domine.
          </h1>

          <p className={styles.heroText}>
            Trouve un adversaire de ton niveau,
            engage tes crédits fictifs et impose
            ton jeu. Ici, chaque match compte.
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
              <Bot />
              Verdict intelligent
            </span>

            <span>
              <Gamepad2 />
              Quatre modes de jeu
            </span>
          </div>
        </div>

        <div className={styles.welcomeCredits}>
          <span>Crédits fictifs offerts</span>

          <strong>
            10 000
            <small> FCFA</small>
          </strong>
        </div>
      </section>

      <div className={styles.ticker}>
        <div>
          <span>Joue pour la victoire</span>
          <i>✦</i>
          <span>Affronte ta division</span>
          <i>✦</i>
          <span>Prouve ton résultat</span>
          <i>✦</i>
          <span>Gravis les échelons</span>
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
              GOALX organise la rencontre entre
              deux véritables joueurs. Le match
              reste joué directement dans eFootball.
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
        id="verdict"
        className={styles.verdictSection}
      >
        <div className={styles.verdictContent}>
          <span className="eyebrow">
            Un résultat contrôlé
          </span>

          <h2 className="display-title">
            Deux preuves.
            <br />
            <em>Un verdict.</em>
          </h2>

          <p className="page-description">
            Notre système compare les captures
            envoyées par les deux participants.
            Il vérifie le score, les noms et la
            cohérence des informations avant de
            rendre sa décision.
          </p>

          <div className={styles.verdictPoints}>
            <span>
              <CheckCircle2 />
              Capture exigée sous cinq minutes
            </span>

            <span>
              <CheckCircle2 />
              Analyse des deux preuves
            </span>

            <span>
              <CheckCircle2 />
              Restitution si le résultat est insuffisant
            </span>
          </div>
        </div>

        <div className={styles.verdictCard}>
          <div className={styles.verdictHeader}>
            <span>Verdict du match</span>

            <span className="status status--active">
              Analyse 
