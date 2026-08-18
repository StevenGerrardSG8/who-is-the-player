import premierLeague from "./premier-league.js";
import laLiga from "./la-liga.js";
import serieA from "./serie-a.js";
import bundesliga from "./bundesliga.js";
import ligue1 from "./ligue-1.js";
import primeiraLiga from "./primeira-liga.js";
import eredivisie from "./eredivisie.js";
import superLig from "./super-lig.js";
import saudiProLeague from "./saudi-pro-league.js";
import mls from "./mls.js";
import brasileirao from "./brasileirao.js";
import argentinaLiga from "./argentina-liga.js";
import qatarStarsLeague from "./qatar-stars-league.js";
import scottishPremiership from "./scottish-premiership.js";
import chineseSuperLeague from "./chinese-super-league.js";
import greekSuperLeague from "./greek-super-league.js";
import russianPremierLeague from "./russian-premier-league.js";
import austrianBundesliga from "./austrian-bundesliga.js";
import ligaMx from "./liga-mx.js";
import indianSuperLeague from "./indian-super-league.js";
import ukrainianPremierLeague from "./ukrainian-premier-league.js";
import j1League from "./j1-league.js";
import aLeague from "./a-league.js";
import uruguayanLiga from "./uruguayan-liga.js";
import worldLegends from "./world-legends.js";
import streetsNeverForget from "./streets-never-forget.js";
import mixedWorldXi from "./mixed-world-xi.js";
import serbianSuperliga from "./serbian-superliga.js";
import belgianProLeague from "./belgian-pro-league.js";
import croatianHnl from "./croatian-hnl.js";
import colombianLiga from "./colombian-liga.js";
import israeliLeague from "./israeli-league.js";
import nationalTeamLegends from "./national-team-legends.js";
import ballonDorWinners from "./ballon-dor-winners.js";
import womensFootball from "./womens-football.js";
import legendaryClubSides from "./legendary-club-sides.js";
import israelisAbroad from "./israelis-abroad.js";
import retro90s2000s from "./retro-90s-2000s.js";
import legendaryManagers from "./legendary-managers.js";
import { EXCLUDED_PLAYER_WIKIS } from "./excluded-players.js";
import { getPublicPackName } from "../brand-policy.js";

// Real, hand-curated packs, in home-screen display order.
const UNFILTERED_CORE_PACKS = {
  [premierLeague.id]: premierLeague,
  [laLiga.id]: laLiga,
  [serieA.id]: serieA,
  [bundesliga.id]: bundesliga,
  [ligue1.id]: ligue1,
  [primeiraLiga.id]: primeiraLiga,
  [eredivisie.id]: eredivisie,
  [superLig.id]: superLig,
  [saudiProLeague.id]: saudiProLeague,
  [mls.id]: mls,
  [brasileirao.id]: brasileirao,
  [argentinaLiga.id]: argentinaLiga,
  [qatarStarsLeague.id]: qatarStarsLeague,
  [scottishPremiership.id]: scottishPremiership,
  [chineseSuperLeague.id]: chineseSuperLeague,
  [greekSuperLeague.id]: greekSuperLeague,
  [russianPremierLeague.id]: russianPremierLeague,
  [austrianBundesliga.id]: austrianBundesliga,
  [ligaMx.id]: ligaMx,
  [indianSuperLeague.id]: indianSuperLeague,
  [ukrainianPremierLeague.id]: ukrainianPremierLeague,
  [j1League.id]: j1League,
  [aLeague.id]: aLeague,
  [uruguayanLiga.id]: uruguayanLiga,
  [worldLegends.id]: worldLegends,
  [streetsNeverForget.id]: streetsNeverForget,
  [mixedWorldXi.id]: mixedWorldXi,
  [serbianSuperliga.id]: serbianSuperliga,
  [belgianProLeague.id]: belgianProLeague,
  [croatianHnl.id]: croatianHnl,
  [colombianLiga.id]: colombianLiga,
  [israeliLeague.id]: israeliLeague,
  [nationalTeamLegends.id]: nationalTeamLegends,
  [ballonDorWinners.id]: ballonDorWinners,
  [womensFootball.id]: womensFootball,
  [legendaryClubSides.id]: legendaryClubSides,
  [israelisAbroad.id]: israelisAbroad,
  [retro90s2000s.id]: retro90s2000s,
  [legendaryManagers.id]: legendaryManagers,
};

const CORE_PACKS = Object.fromEntries(
  Object.entries(UNFILTERED_CORE_PACKS).map(([id, pack]) => [
    id,
    {
      ...pack,
      name: getPublicPackName(pack),
      players: pack.players.filter(({ wiki }) => !EXCLUDED_PLAYER_WIKIS.has(wiki)),
    },
  ]),
);

/**
 * Round-robin interleave every pack's (already easy→hard ordered) player list
 * into one combined, deterministic sequence: level 1 of every league, then
 * level 2 of every league, etc. Deterministic (no Math.random) so a saved
 * levelIndex always points at the same player across reloads.
 */
function buildAllLeaguesMix(packs) {
  const lists = Object.values(packs).map((p) => p.players);
  const maxLen = Math.max(...lists.map((l) => l.length));
  const players = [];
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (list[i]) players.push(list[i]);
    }
  }
  return { id: "all-leagues-mix", name: "All Leagues Mix", icon: "🌐", players };
}

export const PACKS = {
  ...CORE_PACKS,
  "all-leagues-mix": buildAllLeaguesMix(CORE_PACKS),
};
