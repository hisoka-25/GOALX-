import type { Metadata } from "next";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description:
    "Conditions générales d'utilisation de la plateforme GOALX — compétition eFootball avec mises en crédits."
};

export default function CguPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        <ArrowLeft />
        Retour à l'accueil
      </Link>

      <header className={styles.header}>
        <span className="eyebrow">Légal</span>
        <h1>
          CONDITIONS
          <br />
          <em>D'UTILISATION.</em>
        </h1>
        <p>
          En créant un compte et en utilisant GOALX, tu reconnais
          avoir lu et accepté les présentes conditions.
        </p>
      </header>

      <article className={styles.content}>
        <Section title="1. Présentation du service">
          GOALX est une plateforme de matchs compétitifs sur le jeu
          eFootball™. Les joueurs déposent des fonds, les
          convertissent en crédits libellés en FCFA, et les
          engagent comme mise dans des matchs à un contre un. Le
          vainqueur remporte le pot, déduction faite d'une
          commission de service de 7 %.
        </Section>

        <Section title="2. Âge et éligibilité">
          L'inscription et l'utilisation du service sont réservées
          aux personnes âgées de 18 ans et plus. Les mises étant
          payantes, toute inscription d'un mineur est interdite.
          En t'inscrivant, tu déclares être majeur.
        </Section>

        <Section title="3. Compte et profil">
          Tu es responsable de l'exactitude des informations de ton
          profil (nom eFootball, équipe, mode de jeu) et de la
          confidentialité de ton mot de passe. Un seul compte par
          personne est autorisé. Les comptes multiples, la fraude ou
          l'usurpation d'identité entraînent la suspension du compte.
        </Section>

        <Section title="4. Crédits et portefeuille">
          Les crédits constituent la contrepartie des fonds déposés
          et servent exclusivement à engager des mises sur GOALX.
          Le solde est libellé en FCFA. Les fonds correspondant aux
          crédits sont conservés auprès de notre prestataire de
          paiement. Aucun crédit gratuit n'est offert à l'inscription.
        </Section>

        <Section title="5. Dépôts">
          Les dépôts s'effectuent via notre prestataire de paiement
          (Mobile Money et carte bancaire). Un dépôt est crédité sur
          ton portefeuille après confirmation effective du paiement.
          Les dépôts sont destinés à être utilisés pour jouer.
        </Section>

        <Section title="6. Retraits">
          Les gains disponibles peuvent être retirés vers un compte
          Mobile Money. Le montant minimum de retrait est de
          2 000 FCFA. Les retraits sont traités selon les délais de
          notre prestataire. En cas d'échec du versement, le montant
          est automatiquement recrédité sur ton portefeuille. GOALX
          ne peut être tenu responsable des délais ou restrictions
          imposés par les opérateurs Mobile Money.
        </Section>

        <Section title="7. Commission">
          Une commission de 7 % est prélevée sur chaque match gagné.
          Elle couvre les frais de fonctionnement, de paiement et de
          vérification de la plateforme.
        </Section>

        <Section title="8. Matchs et mises">
          La mise de chaque joueur est réservée dès le début du
          match et versée au vainqueur à l'issue de la vérification.
          Le matchmaking associe les joueurs selon la mise et le
          mode de jeu. Les matchs amicaux eFootball doivent être
          joués loyalement, selon les indications de la salle de
          match (invitation, captures de résultat).
        </Section>

        <Section title="9. Résultats et vérification">
          Les joueurs déclarent leur score et fournissent des
          captures d'écran du résultat. GOALX vérifie la cohérence
          des éléments fournis, y compris par un système automatisé.
          En cas de contradiction, de preuve manquante dans le délai
          imparti ou de match inachevé, les mises peuvent être
          restituées aux deux joueurs.
        </Section>

        <Section title="10. Litiges et sanctions">
          GOALX peut examiner tout comportement signalé : tricherie,
          fausse déclaration de score, déconnexion volontaire,
          insultes ou tentative de fraude. Selon la gravité, GOALX
          peut annuler un match, restituer les mises, suspendre ou
          clôturer un compte, sans préjudice d'autres recours.
        </Section>

        <Section title="11. Comportements interdits">
          Sont interdits : la tricherie sous toutes ses formes,
          l'utilisation de bugs, le partage de compte, le blanchiment
          d'argent, les paiements frauduleux, les attaques techniques
          contre la plateforme et tout agissement illégal.
        </Section>

        <Section title="12. Responsabilité">
          GOALX met tout en œuvre pour assurer la disponibilité du
          service mais ne saurait être tenu responsable des
          interruptions liées à Internet, aux opérateurs de paiement
          ou à l'éditeur du jeu. Les résultats des matchs dépendent
          des joueurs ; GOALX n'est pas un service de hasard mais une
          plateforme de compétition basée sur l'habileté.
        </Section>

        <Section title="13. Données personnelles">
          Tes données (profil, matchs, transactions) sont utilisées
          pour faire fonctionner le service et sécuriser les
          paiements. Conformément à la réglementation applicable, tu
          disposes d'un droit d'accès et de rectification de tes
          données.
        </Section>

        <Section title="14. Modification des conditions">
          GOALX peut mettre à jour les présentes conditions. Toute
          modification importante sera portée à la connaissance des
          utilisateurs. La poursuite de l'utilisation vaut
          acceptation.
        </Section>

        <Section title="15. Contact">
          Pour toute question, réclamation ou demande relative à ton
          compte ou à une transaction, contacte le support :
          <br />
          E-mail :{" "}
          <a href="mailto:laraigneehisoka@gmail.com">
            laraigneehisoka@gmail.com
          </a>
        </Section>

        <p className={styles.legal}>
          GOALX — Document à faire relire et valider par un
          conseiller juridique avant l'ouverture officielle au
          public.
        </p>
      </article>
    </main>
  );
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
