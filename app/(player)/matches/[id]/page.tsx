import type { Metadata } from "next";

import { notFound, redirect } from "next/navigation";

import { MatchRoomClient } from "@/components/matches/MatchRoomClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Salle de match",
  description:
    "Accepte le défi, dispute ton match et envoie ta capture de résultat."
};

type MatchPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type MatchData = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  winner_id: string | null;
  stake: number;
  commission_rate: number;
  game_mode: string;
  status: string;
  player_one_accepted: boolean;
  player_two_accepted: boolean;
  evidence_deadline: string | null;
};

type ProfileData = {
  id: string;
  username: string;
  efootball_username: string;
  team: string;
  division: number;
};

type EvidenceData = {
  user_id: string;
};

type AiReviewData = {
  verdict: string;
  explanation: string;
  detected_score: string | null;
};

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function MatchPage({
  params
}: MatchPageProps) {
  const {
    id: matchId
  } = await params;

  if (!isValidUuid(matchId)) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      `/login?redirect=/matches/${matchId}`
    );
  }

  /*
   * La politique RLS de Supabase empêche déjà
   * un joueur de récupérer un match auquel
   * il ne participe pas.
   */
  const {
    data: matchResult,
    error: matchError
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        winner_id,
        stake,
        commission_rate,
        game_mode,
        status,
        player_one_accepted,
        player_two_accepted,
        evidence_deadline
      `
    )
    .eq("id", matchId)
    .maybeSingle();

  if (
    matchError ||
    !matchResult
  ) {
    notFound();
  }

  const match =
    matchResult as MatchData;

  const isParticipant =
    match.player_one_id === user.id ||
    match.player_two_id === user.id;

  if (!isParticipant) {
    notFound();
  }

  /*
   * Les profils, les preuves et le verdict sont
   * récupérés en parallèle après la validation
   * de l’accès au match.
   */
  const [
    profilesResult,
    evidenceResult,
    reviewResult
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
          id,
          username,
          efootball_username,
          team,
          division
        `
      )
      .in("id", [
        match.player_one_id,
        match.player_two_id
      ]),

    supabase
      .from("match_evidence")
      .select("user_id")
      .eq("match_id", matchId),

    supabase
      .from("ai_reviews")
      .select(
        `
          verdict,
          explanation,
          detected_score
        `
      )
      .eq("match_id", matchId)
      .maybeSingle()
  ]);

  if (
    profilesResult.error ||
    !profilesResult.data ||
    profilesResult.data.length !== 2
  ) {
    notFound();
  }

  const profiles =
    profilesResult.data as ProfileData[];

  const playerOne = profiles.find(
    (profile) =>
      profile.id ===
      match.player_one_id
  );

  const playerTwo = profiles.find(
    (profile) =>
      profile.id ===
      match.player_two_id
  );

  if (!playerOne || !playerTwo) {
    notFound();
  }

  const evidence =
    (evidenceResult.data ??
      []) as EvidenceData[];

  const currentUserHasEvidence =
    evidence.some(
      (item) =>
        item.user_id === user.id
    );

  const opponentHasEvidence =
    evidence.some(
      (item) =>
        item.user_id !== user.id
    );

  const review =
    reviewResult.data as
      | AiReviewData
      | null;

  return (
    <MatchRoomClient
      matchId={match.id}
      currentUserId={user.id}
      playerOne={{
        id: playerOne.id,
        username: playerOne.username,
        efootballUsername:
          playerOne.efootball_username,
        team: playerOne.team,
        division: playerOne.division
      }}
      playerTwo={{
        id: playerTwo.id,
        username: playerTwo.username,
        efootballUsername:
          playerTwo.efootball_username,
        team: playerTwo.team,
        division: playerTwo.division
      }}
      winnerId={match.winner_id}
      stake={Number(match.stake)}
      commissionRate={
        match.commission_rate
      }
      gameMode={match.game_mode}
      initialStatus={match.status}
      playerOneAccepted={
        match.player_one_accepted
      }
      playerTwoAccepted={
        match.player_two_accepted
      }
      initialEvidenceDeadline={
        match.evidence_deadline
      }
      currentUserHasEvidence={
        currentUserHasEvidence
      }
      opponentHasEvidence={
        opponentHasEvidence
      }
      verdict={
        review?.verdict ?? null
      }
      verdictExplanation={
        review?.explanation ?? null
      }
      detectedScore={
        review?.detected_score ?? null
      }
    />
  );
}
