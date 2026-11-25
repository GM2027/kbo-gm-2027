import rawV18Dataset from './v18RecalibratedData.json';
import {
  CareerBatterStats,
  CareerPitcherStats,
  CareerSave,
  Coach,
  Player,
  Position,
  TeamId,
  TeamState,
  V18EvaluationMeta,
  V18SeasonStatRecord,
} from '../types/kbo';
import { emptyBatterStats, emptyPitcherStats } from '../engine/stats';
import { buildInitialCoachesForMode } from './coachesData';
import { KBO_TEAMS, TEAM_IDS } from './kboTeams';
import { REAL_KBO_HITTER_POSITIONS } from './playerMetadata';
import { findRealPlayerClubProfile } from './realKboHistories';

export const KBO_2027_MIN_SALARY_BILLION = 0.33; // 2027 개정 KBO 규정: 최저 연봉 3,300만 원
export const KBO_2026_MIN_SALARY_BILLION = 0.3;

export function getKboMinSalaryBillion(season: number): number {
  return season >= 2027 ? KBO_2027_MIN_SALARY_BILLION : KBO_2026_MIN_SALARY_BILLION;
}

interface RawV18Player {
  id: string;
  name: string;
  team: string;
  position: string;
  jersey: string | null;
  level_2026: number | null;
  status: string;
  fa_approved_2027: boolean;
  foreign_slot: string | null;
  draft_round: number | null;
  draft_pick: number | null;
  birth_date: string | null;
  bats: string | null;
  throws: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  salary_krw: number | null;
  contract_end_year: number | null;
  game_ratings: {
    overall: number;
    potential: number;
    batting: Player['v18Ratings'] extends infer R
      ? R extends { batting: infer B }
        ? B
        : never
      : never;
    pitching: Player['v18Ratings'] extends infer R
      ? R extends { pitching: infer P }
        ? P
        : never
      : never;
    fitness?: number;
    morale?: number;
  };
  evaluation_v18: V18EvaluationMeta;
}

interface RawV18Dataset {
  version: string;
  generatedFrom: string;
  playerCount: number;
  officialRosterCount: number;
  draftCandidates2027: number;
  players: RawV18Player[];
}

const V18_DATA = rawV18Dataset as unknown as RawV18Dataset;

const V18_TEAM_MAP: Record<string, TeamId> = {
  LG: 'LG',
  HH: '한화',
  SSG: 'SSG',
  SS: '삼성',
  NC: 'NC',
  KT: 'KT',
  LT: '롯데',
  HT: 'KIA',
  OB: '두산',
  WO: '키움',
};

function parseIpToOuts(ipStr?: string): number {
  if (!ipStr) return 0;
  const trimmed = ipStr.trim();
  const fracMatch = trimmed.match(/^(\d+)\s+(\d)\/3$/);
  if (fracMatch) {
    return Number(fracMatch[1]) * 3 + Number(fracMatch[2]);
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return 0;
  const whole = Math.floor(num);
  const rem = Math.round((num - whole) * 10);
  if (rem === 1 || rem === 2) return whole * 3 + rem;
  return Math.round(num * 3);
}

function computeAgeFor2027(raw: RawV18Player): { age: number; birthYear: number } {
  if (raw.birth_date && /^\d{4}/.test(raw.birth_date)) {
    const by = Number(raw.birth_date.slice(0, 4));
    if (Number.isFinite(by) && by >= 1975 && by <= 2012) {
      return { age: Math.max(18, Math.min(45, 2027 - by)), birthYear: by };
    }
  }
  if (raw.status === 'drafted_2027') {
    // 2027 신인 지명자는 2027시즌 기준 만 19세(2008년생) 기본
    return { age: 19, birthYear: 2008 };
  }
  const evalAge = raw.evaluation_v18?.age_used;
  if (typeof evalAge === 'number' && Number.isFinite(evalAge) && evalAge >= 18 && evalAge <= 46) {
    // v18 age_used는 2026 기준 나이이므로 2027시즌 +1 반영 (최대 45)
    const age2027 = Math.min(45, Math.max(19, Math.round(evalAge) + 1));
    return { age: age2027, birthYear: 2027 - age2027 };
  }
  // 추정치 (레벨·능력치 기반)
  const est = raw.level_2026 === 1 ? 27 : 23;
  return { age: est, birthYear: 2027 - est };
}

function computeRecent3YrScore(
  records: V18SeasonStatRecord[],
  role: '투수' | '타자',
  fallbackOvr: number
): number {
  if (!records || records.length === 0) return Math.max(30, Math.min(95, fallbackOvr));
  const weights: Record<number, number> = { 2026: 0.5, 2025: 0.32, 2024: 0.18 };
  let totalW = 0;
  let weightedSum = 0;
  for (const r of records) {
    const w = weights[r.season] ?? 0.12;
    let sScore = fallbackOvr;
    if (role === '타자') {
      const avg = typeof r.AVG === 'number' && Number.isFinite(r.AVG) ? r.AVG : 0.255;
      const ops =
        typeof r.OPS === 'number' && Number.isFinite(r.OPS)
          ? r.OPS
          : avg * 2.65 + ((r.HR ?? 0) / Math.max(40, r.PA ?? 150)) * 2.2;
      const pa = r.PA ?? r.AB ?? 0;
      const exposureFactor = Math.min(1, Math.max(0.35, pa / 350));
      sScore = Math.round(
        Math.max(38, Math.min(98, 52 + (ops - 0.72) * 115 + (avg - 0.265) * 85)) *
          (0.65 + 0.35 * exposureFactor)
      );
    } else {
      const era = typeof r.ERA === 'number' && Number.isFinite(r.ERA) ? r.ERA : 4.65;
      const whip = typeof r.WHIP === 'number' && Number.isFinite(r.WHIP) ? r.WHIP : 1.42;
      const outs = parseIpToOuts(r.IP);
      const exposureFactor = Math.min(1, Math.max(0.35, outs / 180));
      sScore = Math.round(
        Math.max(38, Math.min(98, 72 + (4.4 - era) * 9.5 + (1.38 - whip) * 22)) *
          (0.65 + 0.35 * exposureFactor)
      );
    }
    weightedSum += sScore * w;
    totalW += w;
  }
  if (totalW <= 0) return Math.max(30, Math.min(95, fallbackOvr));
  return Math.max(35, Math.min(98, Math.round(weightedSum / totalW)));
}

function buildHistoricalCareerStats(
  records: V18SeasonStatRecord[],
  role: '투수' | '타자'
): CareerBatterStats | CareerPitcherStats | undefined {
  if (!records || records.length === 0) return undefined;
  if (role === '타자') {
    const agg: CareerBatterStats = {
      seasons: records.length,
      G: 0,
      AB: 0,
      H: 0,
      HR: 0,
      RBI: 0,
      R: 0,
      BB: 0,
      SB: 0,
    };
    for (const r of records) {
      agg.G += r.G ?? 0;
      agg.AB += r.AB ?? 0;
      agg.H += r.H ?? 0;
      agg.HR += r.HR ?? 0;
      agg.RBI += r.RBI ?? 0;
      agg.R += r.R ?? 0;
      agg.BB += r.BB ?? 0;
      agg.SB += r.SB ?? 0;
    }
    return agg;
  }
  const agg: CareerPitcherStats = {
    seasons: records.length,
    G: 0,
    outs: 0,
    W: 0,
    L: 0,
    SV: 0,
    HLD: 0,
    SO: 0,
    ER: 0,
    BB: 0,
    H: 0,
  };
  for (const r of records) {
    agg.G += r.G ?? 0;
    agg.outs += parseIpToOuts(r.IP);
    agg.W += r.W ?? 0;
    agg.L += r.L ?? 0;
    agg.SV += r.SV ?? 0;
    agg.HLD += r.HLD ?? 0;
    agg.SO += r.SO ?? 0;
    agg.ER += r.ER ?? 0;
    agg.BB += r.BB ?? 0;
    agg.H += r.H ?? 0;
  }
  return agg;
}

function inferConcretePosition(
  raw: RawV18Player,
  teamId: TeamId,
  ifCounter: number,
  ofCounter: number
): { role: '투수' | '타자'; position: Position } {
  const posRaw = (raw.position || '').toUpperCase();
  if (posRaw === 'P') {
    return { role: '투수', position: 'SP' };
  }
  if (posRaw === 'TWP') {
    // 투타겸업(TWP): 세부 능력치 비교로 주포지션 결정
    const off = raw.game_ratings?.batting?.overall_offense ?? 0;
    const pit = raw.game_ratings?.pitching?.overall_pitching ?? 0;
    if (pit >= off) return { role: '투수', position: 'SP' };
    return { role: '타자', position: 'RF' };
  }
  if (posRaw === 'C') {
    return { role: '타자', position: 'C' };
  }
  const teamPosMap = REAL_KBO_HITTER_POSITIONS[teamId];
  const known = teamPosMap?.[raw.name]?.position;
  if (known) {
    return { role: '타자', position: known };
  }
  if (posRaw === 'IF') {
    const cycle: Position[] = ['SS', '3B', '2B', '1B'];
    return { role: '타자', position: cycle[ifCounter % cycle.length] };
  }
  if (posRaw === 'OF') {
    const cycle: Position[] = ['CF', 'RF', 'LF'];
    return { role: '타자', position: cycle[ofCounter % cycle.length] };
  }
  return { role: '타자', position: 'DH' };
}

function estimateDomesticSalaryBillion(raw: RawV18Player, ovr: number, age: number): number {
  if (typeof raw.salary_krw === 'number' && Number.isFinite(raw.salary_krw) && raw.salary_krw > 0) {
    return Math.max(
      KBO_2027_MIN_SALARY_BILLION,
      Math.round((raw.salary_krw / 1e8) * 100) / 100
    );
  }
  if (raw.status === 'drafted_2027') return KBO_2027_MIN_SALARY_BILLION;
  if (ovr >= 84) return Math.round((8.5 + (ovr - 84) * 1.4) * 10) / 10;
  if (ovr >= 78) return Math.round((4.0 + (ovr - 78) * 0.7) * 10) / 10;
  if (ovr >= 72) return Math.round((1.8 + (ovr - 72) * 0.35) * 10) / 10;
  if (ovr >= 65) return Math.round((0.8 + (ovr - 65) * 0.14) * 100) / 100;
  if (age >= 27) return 0.55;
  return KBO_2027_MIN_SALARY_BILLION;
}

function assignForeignAdaptationProfile(ovr: number, seedHash: number): Player['foreignAdaptationProfile'] {
  const roll = Math.abs(seedHash) % 100;
  if (ovr >= 76 && roll < 38) return '빠른적응';
  if (roll < 72) return '표준';
  if (roll < 90) return '기복';
  return '적응난항';
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 전체 선수단의 OVR <= POT 불변식 및 ID 유일성 보장.
 * v18 데이터 적용, 성장/노쇠화, 세이브 로드 등 모든 시점에서 안전하게 호출 가능.
 */
export function enforceOvrPotInvariantInPlace(players: Record<string, Player>): void {
  for (const p of Object.values(players)) {
    if (!Number.isFinite(p.ability)) p.ability = 50;
    if (!Number.isFinite(p.potential)) p.potential = p.ability;
    p.potential = Math.max(1, Math.min(99, Math.round(p.potential)));
    p.ability = Math.max(1, Math.min(p.potential, Math.round(p.ability)));
    if (p.v18Ratings) {
      p.v18Ratings.potential = Math.max(p.v18Ratings.overall, Math.min(99, p.v18Ratings.potential));
      p.v18Ratings.overall = Math.min(p.v18Ratings.overall, p.v18Ratings.potential);
    }
  }
}

export function sanitizeCareerOvrPotInPlace(career: CareerSave): void {
  enforceOvrPotInvariantInPlace(career.players);
}

/**
 * KBO_GM_2027_v18_recalibrated.json (731명) 기반 2027시즌 새 커리어 전체 10개 구단 선수단·로스터·코치 생성.
 * - 기존 731명 전원 유지, ID 중복 0건, OVR <= POT 100% 보장
 * - 2024~2026 성적은 historicalSeasons & careerStats로 보존, 2027시즌 stats는 0부터 시작
 * - 2027 개정 최저연봉 3,300만 원(0.33억) 반영
 */
export function buildAll10TeamsFromV18Dataset(): {
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  coaches: Record<TeamId, Coach[]>;
  faCoaches: Coach[];
  v18Summary: {
    totalPlayers: number;
    officialRosterCount: number;
    drafted2027Count: number;
    faApproved2027Count: number;
  };
} {
  const players: Record<string, Player> = {};
  const seenIds = new Set<string>();
  const { coaches, faCoaches } = buildInitialCoachesForMode(false);

  const ifCountByTeam: Record<string, number> = {};
  const ofCountByTeam: Record<string, number> = {};
  let drafted2027Count = 0;
  let faApproved2027Count = 0;

  for (const raw of V18_DATA.players) {
    const teamId: TeamId = V18_TEAM_MAP[raw.team] ?? 'LG';
    const pid = String(raw.id).trim();
    if (!pid || seenIds.has(pid)) {
      continue;
    }
    seenIds.add(pid);

    const ifIdx = ifCountByTeam[teamId] ?? 0;
    const ofIdx = ofCountByTeam[teamId] ?? 0;
    const { role, position } = inferConcretePosition(raw, teamId, ifIdx, ofIdx);
    if (raw.position === 'IF') ifCountByTeam[teamId] = ifIdx + 1;
    if (raw.position === 'OF') ofCountByTeam[teamId] = ofIdx + 1;

    const rawOvr = Math.round(Number(raw.game_ratings?.overall ?? raw.evaluation_v18?.ovr ?? 50));
    const rawPot = Math.round(Number(raw.game_ratings?.potential ?? raw.evaluation_v18?.pot ?? rawOvr));
    const potential = Math.max(1, Math.min(99, Math.max(rawOvr, rawPot)));
    const ability = Math.max(1, Math.min(potential, rawOvr));

    const { age, birthYear } = computeAgeFor2027(raw);
    const category: Player['category'] =
      raw.foreign_slot === 'asia'
        ? '아시아쿼터'
        : raw.foreign_slot === 'foreign'
          ? '외국인'
          : '국내';

    const isDrafted2027 = raw.status === 'drafted_2027';
    if (isDrafted2027) drafted2027Count += 1;
    if (raw.fa_approved_2027) faApproved2027Count += 1;

    const records = raw.evaluation_v18?.records ?? [];
    const recent3YrScore = computeRecent3YrScore(records, role, ability);

    // 실제 KBO 통산/프랜차이즈 메타데이터 연동 (류현진, 구자욱, 김광현, 최정, 양현종 등 원소속/통산 기록 유지)
    const realHist = findRealPlayerClubProfile(raw.name, teamId);
    const v18CareerAgg = buildHistoricalCareerStats(records, role);

    const careerStats: CareerBatterStats | CareerPitcherStats | undefined = v18CareerAgg;
    let careerSeasons = Math.max(
      isDrafted2027 ? 0 : 1,
      records.length,
      Math.max(0, age - 20)
    );
    let clubTenureSeasons = isDrafted2027 ? 0 : Math.max(1, Math.min(careerSeasons, Math.max(1, age - 21)));
    let isOneClubMan = isDrafted2027 ? true : undefined;
    let careerTeamHistory: Player['careerTeamHistory'] = undefined;

    if (realHist) {
      careerSeasons = Math.max(careerSeasons, realHist.clubTenure2026 + 1);
      clubTenureSeasons = Math.max(clubTenureSeasons, realHist.clubTenure2026 + 1);
      isOneClubMan = realHist.isOneClubMan;
      careerTeamHistory = realHist.history.map((h) => ({ ...h }));
    }

    // 계약 정보 구성 (2027 최저연봉 3,300만 원 적용)
    let contract: Player['contract'];
    if (category === '외국인') {
      const salUsd = Math.min(900000, Math.max(550000, Math.round((ability * 10000) / 50000) * 50000));
      const bonusUsd = Math.min(200000, Math.max(100000, 1000000 - salUsd));
      contract = {
        status: '확정',
        currency: 'USD',
        years: 1,
        yearsRemaining: 1,
        annualSalary: salUsd,
        signingBonus: bonusUsd,
        totalValue: salUsd + bonusUsd,
        startSeason: 2027,
        endSeason: 2027,
        note: '2027 외국인 선수 계약 (v18 DB)',
      };
    } else if (category === '아시아쿼터') {
      contract = {
        status: '확정',
        currency: 'USD',
        years: 1,
        yearsRemaining: 1,
        annualSalary: 150000,
        signingBonus: 30000,
        totalValue: 180000,
        startSeason: 2027,
        endSeason: 2027,
        note: '2027 아시아쿼터 선수 계약 ($200,000 상한 준수)',
      };
    } else {
      const annual = estimateDomesticSalaryBillion(raw, ability, age);
      const endYear =
        typeof raw.contract_end_year === 'number' && raw.contract_end_year >= 2027
          ? raw.contract_end_year
          : 2027;
      const yearsRem = Math.max(1, endYear - 2026);
      contract = {
        status: raw.fa_approved_2027 ? 'FA' : '확정',
        currency: 'KRW',
        years: yearsRem,
        yearsRemaining: raw.fa_approved_2027 ? 0 : yearsRem,
        annualSalary: annual,
        signingBonus: 0,
        totalValue: Math.round(annual * yearsRem * 100) / 100,
        startSeason: 2027,
        endSeason: endYear,
        isFAEligible: raw.fa_approved_2027 || false,
        note: raw.fa_approved_2027
          ? '2027 FA 승인 선수 (v18 DB)'
          : isDrafted2027
            ? '2027 KBO 신인 지명 선수 (최저연봉 3,300만 원)'
            : '2027 보류선수 (v18 재보정 DB)',
      };
    }

    const jerseyNum = raw.jersey && /^\d+$/.test(raw.jersey) ? Number(raw.jersey) : undefined;
    const seedH = hashStr(pid + raw.name);

    const player: Player = {
      id: pid,
      v18SourceId: pid,
      name: raw.name,
      teamId,
      formerTeamId: raw.fa_approved_2027 ? teamId : undefined,
      category,
      role,
      position,
      age,
      birthYear,
      ability,
      potential,
      abilityStatus: '확정',
      form: 0,
      fatigue: 0,
      lastPitchedRound: 0,
      consecutiveAppearances: 0,
      rosterTier: raw.fa_approved_2027 ? 'FA' : isDrafted2027 ? '2군' : raw.level_2026 === 1 ? '1군' : '2군',
      gameDayActive: !raw.fa_approved_2027 && !isDrafted2027 && raw.level_2026 === 1,
      contract,
      injury: null,
      morale: '보통',
      trainingFocus: null,
      serviceYears: isDrafted2027 ? 0 : Math.max(1, Math.min(18, clubTenureSeasons)),
      clubTenureSeasons,
      careerSeasons,
      careerStats,
      careerHits: role === '타자' && careerStats && 'H' in careerStats ? careerStats.H : undefined,
      careerHR: role === '타자' && careerStats && 'HR' in careerStats ? careerStats.HR : undefined,
      careerWins: role === '투수' && careerStats && 'W' in careerStats ? careerStats.W : undefined,
      careerSO: role === '투수' && careerStats && 'SO' in careerStats ? careerStats.SO : undefined,
      careerTeamHistory,
      isOneClubMan,
      uniformNumber: jerseyNum,
      nationality:
        category === '국내' ? '한국' : category === '아시아쿼터' ? '아시아쿼터' : '미국',
      kboAdaptation:
        category === '외국인'
          ? 64 + (seedH % 14)
          : category === '아시아쿼터'
            ? 74 + (seedH % 12)
            : undefined,
      foreignAdaptationProfile:
        category !== '국내' ? assignForeignAdaptationProfile(ability, seedH) : undefined,
      recent3YrScore,
      seasonRatingDelta: 0,
      lastEvaluatedAtTeamGames: 0,
      // 2027시즌 개인 성적은 반드시 0부터 시작
      stats: role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      postseasonStats: role === '타자' ? emptyBatterStats(false) : emptyPitcherStats(false),
      v18Ratings: {
        overall: ability,
        potential,
        batting: raw.game_ratings?.batting ?? null,
        pitching: raw.game_ratings?.pitching ?? null,
      },
      v18Evaluation: {
        ...raw.evaluation_v18,
        ovr: ability,
        pot: potential,
      },
      historicalSeasons: records,
      rookieInfo: isDrafted2027
        ? {
            draftId: raw.draft_pick ?? 0,
            pickNotation: `${raw.draft_round ?? 1}R 전체 ${raw.draft_pick ?? 1}번`,
            round: raw.draft_round ?? 1,
            pickInRound: ((raw.draft_pick ?? 1) - 1) % 10 + 1,
            originType: '고졸',
            school: '2027 신인 지명',
            signingBonusBillion: Math.max(0.3, Math.round((3.5 - ((raw.draft_round ?? 10) - 1) * 0.32) * 10) / 10),
            amateurSummary: `2027 KBO 신인 드래프트 ${raw.draft_round ?? 1}라운드 지명 (v18 평가 POT ${potential})`,
          }
        : undefined,
      acquisitionInfo: isDrafted2027
        ? {
            type: '드래프트',
            draftYear: 2027,
            draftRound: raw.draft_round ?? undefined,
            draftPick: raw.draft_pick ?? undefined,
            label: `2027 ${raw.draft_round ?? 1}R 전체 ${raw.draft_pick ?? 1}번`,
          }
        : raw.draft_round
          ? {
              type: '드래프트',
              draftRound: raw.draft_round,
              draftPick: raw.draft_pick ?? undefined,
              label: `${raw.draft_round}R ${raw.draft_pick ? `전체 ${raw.draft_pick}번` : '지명'}`,
            }
          : category !== '국내'
            ? {
                type: category === '아시아쿼터' ? '아시아쿼터' : '외국인',
                label: category === '아시아쿼터' ? '아시아쿼터 영입' : '외국인 선수 영입',
              }
            : undefined,
      previousAnnualSalary: contract.currency === 'KRW' ? contract.annualSalary : undefined,
      growthCurveProfile:
        age <= 22 && potential - ability >= 20
          ? '대기만성'
          : age >= 35 && ability >= 70
            ? '철강왕'
            : seedH % 5 === 0
              ? '조기개화'
              : '표준',
    };

    players[pid] = player;
  }

  // 구단별 1군(28명) / 선발 5 / 불펜 8 / 주전 9 / 벤치 6 자동 균형 구성
  const teams = {} as Record<TeamId, TeamState>;

  for (const tid of TEAM_IDS) {
    const teamPlayers = Object.values(players).filter(
      (p) => p.teamId === tid && p.rosterTier !== 'FA'
    );

    const pitchers = teamPlayers
      .filter((p) => p.role === '투수')
      .sort((a, b) => {
        const aScore = a.ability + (a.rosterTier === '1군' ? 4 : 0) + (a.category !== '국내' ? 3 : 0);
        const bScore = b.ability + (b.rosterTier === '1군' ? 4 : 0) + (b.category !== '국내' ? 3 : 0);
        return bScore - aScore;
      });

    const hitters = teamPlayers
      .filter((p) => p.role === '타자')
      .sort((a, b) => {
        const aScore = a.ability + (a.rosterTier === '1군' ? 4 : 0) + (a.category !== '국내' ? 4 : 0);
        const bScore = b.ability + (b.rosterTier === '1군' ? 4 : 0) + (b.category !== '국내' ? 4 : 0);
        return bScore - aScore;
      });

    // 선발 5명 (스태미나/구위 높은 상위 5명)
    const starterPool = [...pitchers].sort((a, b) => {
      const aStam = a.v18Ratings?.pitching?.stamina_proxy ?? 50;
      const bStam = b.v18Ratings?.pitching?.stamina_proxy ?? 50;
      const aVal = a.ability * 1.4 + aStam * 0.4 + (a.category !== '국내' ? 5 : 0);
      const bVal = b.ability * 1.4 + bStam * 0.4 + (b.category !== '국내' ? 5 : 0);
      return bVal - aVal;
    });
    const rotationOrder: string[] = [];
    const usedPitchers = new Set<string>();
    for (const sp of starterPool.slice(0, 5)) {
      sp.position = 'SP';
      sp.pitchRole = '선발';
      sp.rosterTier = '1군';
      sp.gameDayActive = true;
      rotationOrder.push(sp.id);
      usedPitchers.add(sp.id);
    }

    // 불펜 8명 (마무리 1 + 셋업/필승조 3 + 중간 3 + 롱릴리프 1)
    const relievers = pitchers.filter((p) => !usedPitchers.has(p.id));
    const bullpenOrder: string[] = [];
    relievers.slice(0, 8).forEach((rp, idx) => {
      rp.position = idx === 0 ? 'CL' : 'RP';
      rp.pitchRole =
        idx === 0
          ? '마무리'
          : idx <= 2
            ? '필승조'
            : idx <= 5
              ? '중간'
              : idx === 6
                ? '추격조'
                : '롱릴리프';
      rp.rosterTier = '1군';
      rp.gameDayActive = true;
      bullpenOrder.push(rp.id);
      usedPitchers.add(rp.id);
    });

    // 나머지 투수는 2군 배치
    for (const p of pitchers) {
      if (!usedPitchers.has(p.id)) {
        p.rosterTier = '2군';
        p.gameDayActive = false;
        p.position = (p.v18Ratings?.pitching?.stamina_proxy ?? 45) >= 58 ? 'SP' : 'RP';
        p.pitchRole = p.position === 'SP' ? '선발' : '중간';
      }
    }

    // 주전 9명 (각 수비 포지션 C, 1B, 2B, 3B, SS, LF, CF, RF + DH 최적화)
    const requiredSlots: Position[] = ['C', 'SS', 'CF', '2B', '3B', '1B', 'RF', 'LF', 'DH'];
    const lineupOrder: string[] = [];
    const lineupPositions: Record<string, Position> = {};
    const usedHitters = new Set<string>();

    for (const slot of requiredSlots) {
      let chosen = hitters.find((h) => !usedHitters.has(h.id) && h.position === slot);
      if (!chosen) {
        chosen = hitters.find((h) => !usedHitters.has(h.id));
      }
      if (chosen) {
        chosen.rosterTier = '1군';
        chosen.gameDayActive = true;
        lineupOrder.push(chosen.id);
        lineupPositions[chosen.id] = slot;
        usedHitters.add(chosen.id);
      }
    }

    // 벤치 6명 (최소 포수 백업 1명 포함)
    const benchOrder: string[] = [];
    const backupCatcher = hitters.find((h) => !usedHitters.has(h.id) && h.position === 'C');
    if (backupCatcher) {
      backupCatcher.rosterTier = '1군';
      backupCatcher.gameDayActive = true;
      benchOrder.push(backupCatcher.id);
      usedHitters.add(backupCatcher.id);
    }
    for (const h of hitters) {
      if (benchOrder.length >= 6) break;
      if (!usedHitters.has(h.id)) {
        h.rosterTier = '1군';
        h.gameDayActive = true;
        benchOrder.push(h.id);
        usedHitters.add(h.id);
      }
    }

    // 나머지 야수는 2군 배치
    for (const h of hitters) {
      if (!usedHitters.has(h.id)) {
        h.rosterTier = '2군';
        h.gameDayActive = false;
      }
    }

    // 등번호 없는 선수에게 구단 내 미사용 번호 부여
    const usedNums = new Set<number>();
    for (const p of teamPlayers) {
      if (p.uniformNumber && !usedNums.has(p.uniformNumber)) {
        usedNums.add(p.uniformNumber);
      }
    }
    let nextNum = 60;
    for (const p of teamPlayers) {
      if (!p.uniformNumber) {
        while (usedNums.has(nextNum)) nextNum++;
        p.uniformNumber = nextNum;
        usedNums.add(nextNum);
      }
    }

    teams[tid] = {
      teamId: tid,
      lineupOrder,
      lineupPositions,
      rotationOrder,
      bullpenOrder,
      benchOrder,
      nextStarterIdx: 0,
      atmosphere: '보통',
      popularity: KBO_TEAMS[tid].basePopularity,
      fanSentiment: 65,
      clubReputation: 70,
    };
  }

  enforceOvrPotInvariantInPlace(players);

  return {
    players,
    teams,
    coaches,
    faCoaches,
    v18Summary: {
      totalPlayers: Object.keys(players).length,
      officialRosterCount: V18_DATA.officialRosterCount,
      drafted2027Count,
      faApproved2027Count,
    },
  };
}
