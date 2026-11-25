import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Crosshair, Flame, Shield, Target } from 'lucide-react';
import { KBO_TEAMS } from '../data/kboTeams';
import { buildAnalyticsReport, computeSalaryCapSummary } from '../engine/deepFranchise';
import { CareerSave, Player } from '../types/kbo';
import { TeamLogo } from './TeamLogo';

interface AnalyticsCenterViewProps {
  career: CareerSave;
  onSelectPlayer?: (player: Player) => void;
  onNavigateTab?: (tab: 'roster' | 'contracts' | 'finances') => void;
}

export const AnalyticsCenterView: React.FC<AnalyticsCenterViewProps> = ({
  career,
  onSelectPlayer,
  onNavigateTab,
}) => {
  const [subTab, setSubTab] = useState<'batters' | 'pitchers' | 'positions' | 'targets'>('batters');

  const report = useMemo(() => buildAnalyticsReport(career, career.playerTeamId), [career]);
  const cap = useMemo(() => computeSalaryCapSummary(career, career.playerTeamId), [career]);
  const team = KBO_TEAMS[career.playerTeamId];

  const env = career.leagueEnv;
  const overuseDangerCount = report.overuseAlerts.filter((p) => p.overuse?.riskLevel === '위험').length;
  const weakPosCount = report.positionStrength.filter((p) => p.status === '보강필요').length;

  return (
    <div className="space-y-5">
      {/* Header & Summary Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TeamLogo teamId={career.playerTeamId} size="md" />
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{team.name} 전력분석실</span>
                <span>·</span>
                <span>{career.season} 시즌 리그 환경: {env?.regime ?? '균형'} (반발계수 {env?.ballCOR?.toFixed(3) ?? '0.415'})</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                구단 데이터 분석센터 (세이버메트릭스 · 구종 · 혹사 리포트)
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">전력분석 보정</div>
              <div className="font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                +{career.analyticsStaffBonus ?? 3}pt
              </div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">보강 필요 포지션</div>
              <div className="font-mono-stats font-bold text-amber-600 dark:text-amber-400">{weakPosCount}곳</div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">혹사 위험 선수</div>
              <div
                className={`font-mono-stats font-bold ${
                  overuseDangerCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {overuseDangerCount}명
              </div>
            </div>
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800" />
            <div className="text-right">
              <div className="text-slate-500 dark:text-slate-400">상위 40인 연봉 / 캡</div>
              <div className="font-mono-stats font-bold text-slate-900 dark:text-white">
                {cap.teamTop40PayrollBillion.toFixed(1)}억 / {cap.capBillion.toFixed(1)}억
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-start gap-2">
            <Crosshair className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <span>{report.lineupInsight}</span>
          </div>
          {onNavigateTab && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab('roster')}
                className="px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                라인업 조정
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('contracts')}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                영입·트레이드 이동
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Overuse Alert Strip if any */}
      {report.overuseAlerts.length > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span>혹사·피로 누적 주의 대상 ({report.overuseAlerts.length}명) — 휴식 미부여 시 기량 저하 및 부상 확률 급증</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.overuseAlerts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPlayer?.(p)}
                className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 text-slate-800 dark:text-slate-200 hover:border-amber-500 transition-colors"
              >
                <span className="font-bold">{p.name}</span>
                <span className="text-slate-500 ml-1">({p.position})</span>
                <span
                  className={`ml-1.5 font-mono-stats font-bold ${
                    p.overuse?.riskLevel === '위험' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {p.overuse?.riskLevel} · 피로 {p.fatigue}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'batters', label: `타자 타구·스플릿 (${report.batters.length})` },
          { id: 'pitchers', label: `투수 구종·구속 분석 (${report.pitchers.length})` },
          { id: 'positions', label: '포지션 전력 진단' },
          { id: 'targets', label: `추천 영입 타깃 (${report.recommendedTargets.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              subTab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Batters */}
      {subTab === 'batters' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="text-left py-2.5 px-3 font-semibold">선수 · 포지션</th>
                  <th className="text-center py-2.5 px-2 font-semibold">OVR/잠재</th>
                  <th className="text-left py-2.5 px-3 font-semibold">타구 방향 경향</th>
                  <th className="text-left py-2.5 px-3 font-semibold">좌/우 투수 스플릿</th>
                  <th className="text-center py-2.5 px-2 font-semibold">득점권 OPS</th>
                  <th className="text-left py-2.5 px-3 font-semibold">변화구 · 특성</th>
                  <th className="text-right py-2.5 px-3 font-semibold">시장지수</th>
                  <th className="text-center py-2.5 px-2 font-semibold">부하</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {report.batters.map((row) => (
                  <tr
                    key={row.player.id}
                    onClick={() => onSelectPlayer?.(row.player)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {row.player.name}
                        <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                          {row.player.position} · {row.player.rosterTier} · 만 {row.player.age}세
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono-stats font-bold text-slate-800 dark:text-slate-200">
                      {row.player.ability}/{row.player.potential}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.sprayLabel}</td>
                    <td className="py-2.5 px-3 font-mono-stats text-slate-700 dark:text-slate-300">{row.splitText}</td>
                    <td className="py-2.5 px-2 text-center font-mono-stats font-bold text-indigo-600 dark:text-indigo-400">
                      {row.rispOpsEst}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      <span>{row.pitchSummary}</span>
                      <span className="ml-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">· {row.traitLabel}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-stats">
                      <span className="font-bold text-slate-900 dark:text-white">{row.tradeValue}</span>
                      <span className="block text-[10px] text-slate-500">{row.tradeTier}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-semibold">
                      <span
                        className={
                          row.overuseRisk === '위험'
                            ? 'text-rose-600 dark:text-rose-400'
                            : row.overuseRisk === '주의'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {row.overuseRisk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Pitchers */}
      {subTab === 'pitchers' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="text-left py-2.5 px-3 font-semibold">투수 · 보직</th>
                  <th className="text-center py-2.5 px-2 font-semibold">OVR/잠재</th>
                  <th className="text-left py-2.5 px-3 font-semibold">투구폼 · 구속</th>
                  <th className="text-left py-2.5 px-3 font-semibold">제구 · 변화구 · 체력</th>
                  <th className="text-left py-2.5 px-3 font-semibold">보유 구종 (완성도)</th>
                  <th className="text-center py-2.5 px-2 font-semibold">특성</th>
                  <th className="text-right py-2.5 px-3 font-semibold">시장지수</th>
                  <th className="text-center py-2.5 px-2 font-semibold">연투/부하</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {report.pitchers.map((row) => (
                  <tr
                    key={row.player.id}
                    onClick={() => onSelectPlayer?.(row.player)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {row.player.name}
                        <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                          {row.player.pitchRole ?? row.player.position} · {row.player.rosterTier} · 만 {row.player.age}세
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono-stats font-bold text-slate-800 dark:text-slate-200">
                      {row.player.ability}/{row.player.potential}
                    </td>
                    <td className="py-2.5 px-3 font-mono-stats text-slate-700 dark:text-slate-300">{row.sprayLabel}</td>
                    <td className="py-2.5 px-3 font-mono-stats text-slate-700 dark:text-slate-300">{row.splitText}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.pitchSummary}</td>
                    <td className="py-2.5 px-2 text-center font-semibold text-indigo-600 dark:text-indigo-400">
                      {row.traitLabel}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-stats">
                      <span className="font-bold text-slate-900 dark:text-white">{row.tradeValue}</span>
                      <span className="block text-[10px] text-slate-500">{row.tradeTier}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono-stats">
                      <span
                        className={`font-semibold ${
                          row.overuseRisk === '위험'
                            ? 'text-rose-600 dark:text-rose-400'
                            : row.overuseRisk === '주의'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {row.overuseRisk}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {row.player.overuse?.consecutivePitchDays ?? 0}연투 · 7일 {row.player.overuse?.recent7dPitches ?? 0}구
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Position Depth Matrix */}
      {subTab === 'positions' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {report.positionStrength.map((ps) => (
            <div
              key={ps.position}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-900 dark:text-white">{ps.position}</span>
                <span
                  className={`text-xs font-bold ${
                    ps.status === '강점'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : ps.status === '양호'
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {ps.status}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 truncate">{ps.starterName}</div>
              <div className="mt-2.5 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    ps.status === '강점'
                      ? 'bg-emerald-500'
                      : ps.status === '양호'
                      ? 'bg-sky-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(20, (ps.avgOvr - 45) * 2))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Target Recommendations */}
      {subTab === 'targets' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-3">
            <Target className="w-4 h-4 text-indigo-500" />
            <span>데이터 기반 취약 포지션 추천 영입 타깃</span>
          </div>
          {report.recommendedTargets.length === 0 ? (
            <p className="text-xs text-slate-500">현재 추천 영입 타깃이 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {report.recommendedTargets.map((item) => (
                <div
                  key={item.player.id}
                  onClick={() => onSelectPlayer?.(item.player)}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <TeamLogo teamId={item.player.teamId} size="sm" />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {item.player.name}
                        <span className="ml-1.5 text-slate-500 font-normal">
                          {KBO_TEAMS[item.player.teamId].shortName} · {item.player.position} · 만 {item.player.age}세 · OVR{' '}
                          {item.player.ability}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.reason}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-stats text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      시장지수 {item.tradeValue}
                    </span>
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateTab('contracts');
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        협상 이동
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 px-1">
        <span className="inline-flex items-center gap-1">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          구종·구속·좌우 스플릿은 경기 시뮬레이션 타석 승부에 직접 반영됩니다.
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          시장가치 지수는 타 구단 단장의 트레이드 공정성 심사와 동일 기준입니다.
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          선수를 클릭하면 상세 스카우팅 리포트를 확인할 수 있습니다.
        </span>
      </div>
    </div>
  );
};
