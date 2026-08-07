import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Upload, TrendingUp, TrendingDown, Minus, Calendar, Grid, LayoutGrid, Award, Crown, ArrowUpRight, ArrowDownRight, Target, Zap, BarChart2, Clock, Link, FileText, X, ChevronDown, RefreshCw, Globe, Gauge } from 'lucide-react';

// --- Types ---
type RankingData = {
  date: string;
  [key: string]: number | string;
};

type ParsedData = {
  headers: string[];
  rows: RankingData[];
  dates: string[];
};

type KeywordStat = {
  keyword: string;
  rank: number;
  prevRank: number;
  diff: number;
  isNew: boolean;
  dropped: boolean;
  color: string;
};

// 定義翻譯字典的型別
type TranslationDictionary = Record<string, string>;

// --- Constants ---
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/10-yQ3U2JVN9cdix1rELdz12YveJgfc-vul9Te_G880o/edit?usp=sharing";

const COLORS = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#d946ef', // fuchsia-500
];

// --- Helper: Transform Google Sheet URL to CSV Export URL with Cache Busting ---
const getCsvExportUrl = (url: string): string | null => {
  try {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&t=${new Date().getTime()}`;
    }
    return url;
  } catch (e) {
    return url;
  }
};

// --- Helper: Parse CSV ---
const parseCSV = (text: string): ParsedData => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [], dates: [] };

  const parseLine = (line: string) => {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (line[i] === ',' && !inQuotes) {
        result.push(line.substring(start, i));
        start = i + 1;
      }
    }
    result.push(line.substring(start));
    
    return result.map(s => {
      let val = s.trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      return val.trim();
    });
  };

  const headers = parseLine(lines[0]);
  const rows: RankingData[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; 
    const values = parseLine(lines[i]);
    if (values.length < headers.length) continue;

    const row: Record<string, string | number> = {};
    let date = '';

    headers.forEach((header, index) => {
      let val = values[index];
      if (index === 0) {
        row['date'] = val;
        date = val;
      } else {
        row[header] = parseInt(val, 10) || 0;
      }
    });

    if (date) {
      rows.push(row as RankingData);
    }
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const sortedDates = rows.map(r => r.date as string);
  const keywordHeaders = headers.filter(h => h && h.toLowerCase() !== 'date' && h !== '');

  return { headers: keywordHeaders, rows, dates: sortedDates };
};

const getKeywordColor = (index: number) => COLORS[index % COLORS.length];

const getMonthlySnapshots = (dates: string[]) => {
  const snapshots: { monthLabel: string; date: string; index: number }[] = [];
  const processedMonths = new Set<string>();

  for (let i = dates.length - 1; i >= 0; i--) {
    const dateStr = dates[i];
    const dateObj = new Date(dateStr);
    const monthKey = `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}`;

    if (!processedMonths.has(monthKey)) {
      const monthLabel = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      snapshots.unshift({ monthLabel, date: dateStr, index: i }); 
      processedMonths.add(monthKey);
    }
  }
  return snapshots;
};

// --- Components ---

const AnalyticsView = ({ data, t }: { data: ParsedData, t: TranslationDictionary }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [threshold, setThreshold] = useState(10); 

  useEffect(() => {
    if (data.dates.length > 0) {
      setStartDate(data.dates[0]);
      setEndDate(data.dates[data.dates.length - 1]);
    }
  }, [data.dates]);

  const analysisResults = useMemo(() => {
    if (!startDate || !endDate || data.rows.length === 0) {
      return { stats: [], calendarDays: 0 };
    }

    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const startTs = startObj.getTime();
    const endTs = endObj.getTime();

    const diffTime = Math.abs(endTs - startTs);
    const calendarDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const stats = data.headers.map((keyword, idx) => {
      let daysHeld = 0;
      let currentRowIdx = -1;

      for(let i = 0; i < data.rows.length; i++) {
        const rowDate = new Date(data.rows[i].date).getTime();
        if (rowDate <= startTs) {
          currentRowIdx = i;
        } else {
          break;
        }
      }

      for (let d = 0; d < calendarDays; d++) {
        const currentDayTs = startTs + (d * 86400000);

        while(currentRowIdx < data.rows.length - 1) {
            const nextRowTs = new Date(data.rows[currentRowIdx + 1].date).getTime();
            if (nextRowTs <= currentDayTs) {
                currentRowIdx++;
            } else {
                break;
            }
        }

        if (currentRowIdx >= 0) {
            const rank = data.rows[currentRowIdx][keyword] as number;
            if (rank > 0 && rank <= threshold) {
                daysHeld++;
            }
        }
      }

      return {
        keyword,
        count: daysHeld,
        percentage: calendarDays > 0 ? (daysHeld / calendarDays) * 100 : 0,
        color: getKeywordColor(idx)
      };
    });

    return {
      stats: stats.sort((a, b) => b.count - a.count),
      calendarDays
    };
  }, [data, startDate, endDate, threshold]);

  return (
    <div className="flex-1 w-full min-w-full p-6 bg-slate-50 h-full overflow-y-auto custom-scrollbar font-mju flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 w-full">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart2 className="text-indigo-600" />
            {t.analyticsTitle}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {t.analyticsDesc}
          </p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">{t.startDate}</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 bg-slate-50 font-mju"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">{t.endDate}</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 bg-slate-50 font-mju"
            />
          </div>
          <div className="flex flex-col gap-1 w-24">
            <label className="text-[10px] uppercase font-bold text-slate-400">{t.topX}</label>
            <div className="relative">
              <span className="absolute left-2 top-1.5 text-slate-400 text-xs font-bold">≤</span>
              <input 
                type="number" 
                min="1" 
                max="100"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value) || 0))}
                className="text-sm border border-slate-200 rounded pl-6 pr-2 py-1 w-full focus:outline-none focus:border-indigo-500 bg-slate-50 font-bold text-slate-700 font-mju"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4 w-full">
         <div className="flex items-center gap-4">
            <div className="bg-white p-2 rounded-full shadow-sm text-indigo-600">
              <Clock size={20} />
            </div>
            <div className="text-sm text-indigo-900">
              <div className="text-[10px] uppercase font-bold text-indigo-400 mb-0.5">{t.analysisScope}</div>
              <div>
                {t.duration}: <span className="font-bold text-indigo-700">{analysisResults.calendarDays} {t.days}</span>
              </div>
            </div>
         </div>
         <div className="hidden md:block w-px h-10 bg-indigo-200 mx-2"></div>
         <div className="text-sm text-indigo-900">
            <div className="text-[10px] uppercase font-bold text-indigo-400 mb-0.5">{t.filterCriteria}</div>
            <div>{t.keywordsHolding} <span className="font-bold text-indigo-700">#{threshold}</span></div>
         </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6 pb-10 w-full">
        {analysisResults.stats.map((stat) => (
          <div key={stat.keyword} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group w-full">
            <div 
              className="absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all duration-500" 
              style={{ width: `${stat.percentage}%`, backgroundColor: stat.color }}
            ></div>
            
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 overflow-hidden mr-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stat.color }}></div>
                <h3 className="font-bold text-slate-700 truncate" title={stat.keyword}>{stat.keyword}</h3>
              </div>
              <div className="text-2xl font-bold text-slate-800 tabular-nums">
                {stat.count} <span className="text-xs font-normal text-slate-400">{t.days}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
               <div className="text-xs text-slate-500 font-medium">
                 {t.durationRate}
               </div>
               <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${stat.percentage >= 80 ? 'bg-emerald-100 text-emerald-700' : stat.percentage >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {stat.percentage.toFixed(1)}%
                  </span>
               </div>
            </div>
          </div>
        ))}
        {analysisResults.stats.length === 0 && (
           <div className="col-span-full text-center py-20 text-slate-400 italic">
             No data found.
           </div>
        )}
      </div>
    </div>
  );
};

const BentoGridView = ({ 
  data, 
  snapshot,
  prevSnapshot,
  t
}: { 
  data: ParsedData;
  snapshot: { monthLabel: string; date: string; index: number };
  prevSnapshot?: { monthLabel: string; date: string; index: number };
  t: TranslationDictionary;
}) => {
  const currentRow = data.rows[snapshot.index];
  const prevRow = prevSnapshot ? data.rows[prevSnapshot.index] : null;
  
  const rankings = data.headers.map((keyword, idx) => {
    const rank = currentRow[keyword] as number;
    const prevRank = prevRow ? (prevRow[keyword] as number) : 0;
    
    let diff = 0;
    if (prevRank > 0 && rank > 0) {
      diff = prevRank - rank;
    }

    return {
      keyword,
      rank,
      prevRank,
      diff,
      isNew: prevRank === 0 && rank > 0,
      dropped: rank === 0 && prevRank > 0,
      color: getKeywordColor(idx)
    };
  }).sort((a, b) => {
    if (a.rank === 0 && b.rank === 0) return 0;
    if (a.rank === 0) return 1;
    if (b.rank === 0) return -1;
    return a.rank - b.rank;
  });

  const rankedItems = rankings.filter(r => r.rank > 0);
  const unrankedItems = rankings.filter(r => r.rank === 0);

  const totalRanked = rankedItems.length;
  const top3Count = rankedItems.filter(r => r.rank <= 3).length;
  const page1Count = rankedItems.filter(r => r.rank <= 10).length;

  return (
    <div className="flex-1 w-full min-w-full p-6 bg-slate-50 h-full overflow-y-auto custom-scrollbar font-mju flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 w-full">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutGrid className="text-indigo-600" />
            {t.monthlyHighlights}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Snapshot: <span className="font-bold text-indigo-600">{snapshot.date}</span> 
            {prevSnapshot && <span className="text-slate-400 ml-2">(vs {prevSnapshot.date})</span>}
          </p>
        </div>
        
        <div className="flex gap-3">
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm min-w-[120px] flex flex-col justify-center">
             <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t.totalRanked}</div>
             <div className="text-2xl font-bold text-slate-700">{totalRanked}</div>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm min-w-[120px] flex flex-col justify-center">
             <div className="text-[10px] text-amber-500 uppercase font-bold tracking-wider">{t.top3}</div>
             <div className="text-2xl font-bold text-amber-600">{top3Count}</div>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm min-w-[120px] flex flex-col justify-center">
             <div className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider">{t.page1}</div>
             <div className="text-2xl font-bold text-emerald-600">{page1Count}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-auto min-h-[500px] w-full">
        {/* Dominance */}
        <div className="flex flex-col gap-3">
           <div className="bg-gradient-to-b from-amber-50 to-white border border-amber-200 rounded-xl p-4 shadow-sm flex-1">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-amber-100">
                 <Crown size={18} className="text-amber-500 fill-current" />
                 <h3 className="font-bold text-amber-800 text-base uppercase tracking-tight">{t.dominance}</h3>
              </div>
              <div className="space-y-3">
                {rankedItems.filter(r => r.rank === 1).map((item) => (
                  <div key={item.keyword} className="bg-white border-l-4 border-amber-500 rounded-lg p-3 shadow-sm flex justify-between items-center group hover:shadow-md transition-all hover:-translate-y-0.5">
                     <div className="overflow-hidden">
                       <div className="font-bold text-slate-800 text-sm truncate w-full" title={item.keyword}>{item.keyword}</div>
                       <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                         {item.isNew ? <span className="text-emerald-500 font-bold">NEW 👑</span> : item.diff > 0 ? <span className="text-emerald-500">▲ Up {item.diff}</span> : 'Retained #1'}
                       </div>
                     </div>
                     <div className="text-xl font-bold text-amber-500/40 group-hover:text-amber-500 transition-colors">#1</div>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Podium */}
        <div className="flex flex-col gap-3">
           <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                 <Award size={18} className="text-slate-500" />
                 <h3 className="font-bold text-slate-700 text-base uppercase tracking-tight">{t.podium}</h3>
              </div>
              <div className="space-y-2">
                {rankedItems.filter(r => r.rank === 2 || r.rank === 3).map((item) => (
                  <div key={item.keyword} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex justify-between items-start relative hover:border-slate-300 transition-colors">
                     <div className="z-10 flex-1 min-w-0 pr-2">
                       <div className="font-semibold text-slate-700 text-xs break-words leading-tight">{item.keyword}</div>
                       <div className="text-[9px] flex items-center gap-1 mt-1">
                          {item.diff > 0 ? (
                            <span className="text-emerald-600 font-bold flex items-center"><ArrowUpRight size={8} /> +{item.diff}</span>
                          ) : item.diff < 0 ? (
                            <span className="text-red-500 font-bold flex items-center"><ArrowDownRight size={8} /> -{Math.abs(item.diff)}</span>
                          ) : (
                            <span className="text-slate-400 flex items-center"><Minus size={8} /> Stable</span>
                          )}
                       </div>
                     </div>
                     <div className={`
                       w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10 shrink-0
                       ${item.rank === 2 ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-700'}
                     `}>
                       #{item.rank}
                     </div>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* Page 1 Club */}
        <div className="flex flex-col gap-3">
           <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                 <Target size={18} className="text-emerald-600" />
                 <h3 className="font-bold text-slate-700 text-base uppercase tracking-tight">{t.page1Club}</h3>
              </div>
              <div className="space-y-2">
                {rankedItems.filter(r => r.rank > 3 && r.rank <= 10).map((item) => (
                  <div key={item.keyword} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-1 rounded transition-colors">
                     <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                        <span className="text-slate-600 truncate" title={item.keyword}>{item.keyword}</span>
                     </div>
                     <div className="flex items-center gap-1.5 shrink-0">
                        {item.diff !== 0 && (
                          <span className={`text-[9px] font-bold ${item.diff > 0 ? 'textemerald-500' : 'text-red-500'}`}>
                             {item.diff > 0 ? '▲' : '▼'}
                          </span>
                        )}
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">#{item.rank}</span>
                     </div>
                  </div>
                ))}
              </div>
           </div>
        </div>

        {/* On The Radar */}
        <div className="flex flex-col gap-3">
           <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex-1">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                 <Zap size={18} className="text-slate-400" />
                 <h3 className="font-bold text-slate-500 text-base uppercase tracking-tight">{t.radar}</h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                 {rankedItems.filter(r => r.rank > 10).map((item) => (
                   <div key={item.keyword} className="bg-white px-2 py-1.5 rounded border border-slate-200 text-[10px] flex items-center justify-between text-slate-500 hover:border-slate-300 transition-colors" title={`Rank #${item.rank}`}>
                      <span className="truncate mr-2">{item.keyword}</span>
                      <div className="flex items-center gap-1">
                        {item.diff > 0 && <ArrowUpRight size={8} className="text-emerald-400" />}
                        <span className="font-bold text-slate-400 bg-slate-50 px-1 rounded">#{item.rank}</span>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>

      </div>
      
      {unrankedItems.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 w-full">
           <h4 className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1">
             <Minus size={10} /> {t.unranked}
           </h4>
           <div className="flex flex-wrap gap-2">
              {unrankedItems.map(item => (
                <span key={item.keyword} className={`px-2 py-1 rounded text-[10px] border flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity ${item.dropped ? 'bg-red-50 border-red-100 text-red-400' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                  {item.keyword}
                  {item.dropped && <TrendingDown size={10} />}
                </span>
              ))}
           </div>
        </div>
      )}
    </div>
  );
};

const CurveRaceView = ({ 
  data, 
  stats, 
  currentIndex,
  playbackSpeed
}: { 
  data: ParsedData, 
  stats: KeywordStat[], 
  currentIndex: number,
  playbackSpeed: number
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (containerRef.current) {
      setDims({
        w: containerRef.current.clientWidth,
        h: containerRef.current.clientHeight
      });
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDims({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxRankInData = useMemo(() => {
    let max = 0;
    data.rows.forEach(row => {
      data.headers.forEach(h => {
        const val = row[h] as number;
        if (val > max) max = val;
      });
    });
    const calculatedMax = max > 0 ? Math.ceil(max / 10) * 10 : 50; 
    return Math.min(calculatedMax, 30); // 將圖表的 Y 軸最大範圍強制限制在 30
  }, [data]);

  const chartPadding = { top: 40, right: 220, bottom: 40, left: 40 }; 
  const chartW = dims.w - chartPadding.left - chartPadding.right;
  
  const activeLabelCount = stats.filter(s => s.rank > 0 && s.rank <= maxRankInData).length;
  const labelHeight = 36; 
  const minHeightForLabels = activeLabelCount * labelHeight;
  
  const chartH = Math.max(
    dims.h - chartPadding.top - chartPadding.bottom, 
    maxRankInData * 15, 
    minHeightForLabels * 1.2
  ); 
  
  const Y_DOMAIN_MAX = maxRankInData; 
  
  const getX = (dateIndex: number) => {
    if (data.dates.length <= 1) return 0;
    return (dateIndex / (data.dates.length - 1)) * chartW;
  };

  const getY = (rank: number) => {
    if (rank === 0 || rank > Y_DOMAIN_MAX) return -1; 
    return ((rank - 1) / (Y_DOMAIN_MAX - 1)) * chartH;
  };

  const paths = useMemo(() => {
    if (dims.w === 0) return [];

    return data.headers.map((keyword, kIdx) => {
      let d = '';
      let isFirst = true;

      for (let i = 0; i <= currentIndex; i++) {
        const rank = data.rows[i][keyword] as number;
        const x = getX(i);
        const y = getY(rank);

        if (y === -1) {
          isFirst = true; 
          continue;
        }

        if (isFirst) {
          d += `M ${x} ${y}`;
          isFirst = false;
        } else {
          d += ` L ${x} ${y}`;
        }
      }
      return { keyword, d, color: getKeywordColor(kIdx) };
    });
  }, [data, currentIndex, dims, chartW, chartH, Y_DOMAIN_MAX]);

  const rawLabels = stats
    .filter(s => s.rank > 0 && s.rank <= Y_DOMAIN_MAX)
    .map(s => ({
      id: s.keyword,
      idealY: getY(s.rank),
      rank: s.rank,
      stat: s,
      height: 38 
    }));

  const resolvedLabels = useMemo(() => {
    const sorted = [...rawLabels].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.id.localeCompare(b.id);
    });
    
    const finalPositions: typeof rawLabels = [];
    
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      let y = item.idealY;
      
      if (i > 0) {
        const prev = finalPositions[i - 1];
        const prevBottom = prev.y + prev.height / 2;
        const currentTopIdeal = y - item.height / 2;
        const GAP = 2; 

        if (currentTopIdeal < prevBottom + GAP) {
          y = prevBottom + GAP + item.height / 2;
        }
      }
      finalPositions.push({ ...item, y });
    }

    return finalPositions;
  }, [rawLabels]);

  const currentX = getX(currentIndex);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-50 overflow-hidden select-none font-mju">
      <div className="w-full h-full overflow-y-auto custom-scrollbar relative">
         <div style={{ height: Math.max(dims.h, chartH + 100), width: '100%', position: 'relative' }}>
            <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
              <g transform={`translate(${chartPadding.left},${chartPadding.top})`}>
                
                {Y_DOMAIN_MAX >= 10 && (
                  <rect x={0} y={getY(1) - 10} width={chartW} height={getY(10) - getY(1) + 20} fill="#fefce8" opacity="0.5" />
                )}

                {Array.from({ length: Math.ceil(Y_DOMAIN_MAX / 5) }).map((_, i) => {
                   const rank = (i + 1) * 5; 
                   if (rank > Y_DOMAIN_MAX) return null;
                   
                   const y = getY(rank);
                   return (
                     <g key={rank} transform={`translate(0, ${y})`}>
                       <line x1={0} y1={0} x2={chartW} y2={0} stroke="#e2e8f0" strokeDasharray="4 4" />
                       <text x={-10} y={4} textAnchor="end" fontSize="10" fill="#94a3b8">#{rank}</text>
                     </g>
                   );
                })}
                
                 <g transform={`translate(0, ${getY(1)})`}>
                   <text x={-10} y={4} textAnchor="end" fontSize="11" fontWeight="bold" fill="#b45309">#1</text>
                 </g>
                 
                 {Y_DOMAIN_MAX >= 10 && (
                   <g transform={`translate(0, ${getY(10)})`}>
                     <line x1={0} y1={0} x2={chartW} y2={0} stroke="#f59e0b" strokeWidth="2" strokeDasharray="0" opacity="0.6" />
                     <text x={-10} y={4} textAnchor="end" fontSize="11" fontWeight="bold" fill="#b45309">#10</text>
                   </g>
                 )}

                <line 
                  x1={currentX} 
                  y1={0} 
                  x2={currentX} 
                  y2={chartH} 
                  stroke="#64748b" 
                  strokeWidth="1" 
                  strokeDasharray="2 2"
                />

                {paths.map((p) => (
                   <path 
                     key={p.keyword} 
                     d={p.d} 
                     fill="none" 
                     stroke={p.color} 
                     strokeWidth="2.5" 
                     strokeLinecap="round" 
                     strokeLinejoin="round"
                     className="transition-all ease-linear"
                     style={{ 
                        transitionDuration: `${playbackSpeed}ms`,
                        opacity: 0.8 
                     }}
                   />
                ))}

                {resolvedLabels.map(item => {
                   const isDisplaced = Math.abs(item.y - item.idealY) > 1;
                   const labelOffsetX = 20; 
                   
                   return (
                     <path 
                       key={`link-${item.id}`}
                       d={`M ${currentX} ${item.idealY} L ${currentX + 10} ${item.idealY} L ${currentX + 15} ${item.y} L ${currentX + labelOffsetX} ${item.y}`}
                       fill="none"
                       stroke={item.stat.color}
                       strokeWidth="1.5"
                       strokeDasharray={isDisplaced ? "0" : "0"}
                       opacity={isDisplaced ? 0.8 : 0.4}
                       className="transition-all ease-linear"
                       style={{ transitionDuration: `${playbackSpeed}ms` }}
                     />
                   );
                })}

                {resolvedLabels.map(item => {
                   const isTop10 = item.stat.rank <= 10;
                   return (
                     <circle 
                       key={`dot-${item.id}`} 
                       cx={currentX} 
                       cy={item.idealY} 
                       r={isTop10 ? 5 : 3} 
                       fill={item.stat.color} 
                       stroke="white" 
                       strokeWidth="2"
                       className="transition-all ease-linear"
                       style={{ transitionDuration: `${playbackSpeed}ms` }}
                     />
                   );
                })}
              </g>
            </svg>

            <div 
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ 
                left: chartPadding.left + currentX + 20, 
                top: chartPadding.top, 
                height: chartH,
                width: 200 
              }}
            >
               {resolvedLabels.map(item => {
                 const isTop10 = item.stat.rank <= 10;
                 return (
                   <div 
                     key={item.id}
                     className="absolute left-0 ease-linear flex items-center"
                     style={{ 
                       top: item.y, 
                       transform: 'translateY(-50%)', 
                       width: '100%',
                       transitionProperty: 'top',
                       transitionDuration: `${playbackSpeed}ms` 
                     }}
                   >
                      <div 
                        className={`
                          border shadow-sm rounded-md px-2 py-1 flex items-center gap-2 text-xs w-full max-w-[160px] transition-colors
                          ${isTop10 ? 'bg-amber-50 border-l-4' : 'bg-white border-l-4'}
                        `}
                        style={{ 
                          borderColor: item.stat.color, 
                          boxShadow: isTop10 ? '0 4px 6px -1px rgba(0,0,0,0.1)' : '0 1px 2px 0 rgba(0,0,0,0.05)'
                        }}
                      >
                         <span className={`truncate flex-1 font-mju ${isTop10 ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`} title={item.id}>
                           {item.id}
                         </span>
                         <span className={`font-mono px-1.5 py-0.5 rounded text-[10px] ${isTop10 ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>
                           #{item.stat.rank}
                         </span>
                      </div>
                   </div>
                 );
               })}
            </div>
         </div>
      </div>

      <div 
        className="absolute pointer-events-none transition-all ease-linear bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full top-3 z-10 shadow-lg border border-slate-600 font-mju font-bold tracking-wide"
        style={{ 
          left: Math.max(60, Math.min(dims.w - 60, chartPadding.left + currentX)), 
          transform: 'translateX(-50%)',
          transitionDuration: `${playbackSpeed}ms`
        }}
      >
        {data.dates[currentIndex]}
      </div>
      
    </div>
  );
};

const HeatmapView = ({ 
  data, 
  currentIndex, 
  onDateClick,
  scrollRef 
}: { 
  data: ParsedData, 
  currentIndex: number, 
  onDateClick: (idx: number) => void,
  scrollRef: React.RefObject<HTMLDivElement>
}) => {
  return (
    <div 
      ref={scrollRef}
      className="overflow-x-auto flex-1 w-full bg-white relative custom-scrollbar h-full flex flex-col font-mju"
    >
      <div className="inline-block min-w-full pb-6">
        <div className="sticky top-0 left-0 z-20 bg-slate-50 border-b border-slate-200 flex min-w-max">
            <div className="sticky left-0 w-48 bg-slate-100 border-r border-slate-200 p-3 font-semibold text-sm text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-30 flex items-center">
              Keyword / Date
            </div>
            {data.dates.map((d, idx) => (
              <div 
              key={d + idx} 
              className={`w-10 flex-shrink-0 text-[10px] text-center p-2 border-r border-slate-100 flex items-end justify-center transition-colors duration-300 cursor-pointer hover:bg-slate-100 ${idx === currentIndex ? 'bg-blue-100 font-bold text-blue-800 border-b-4 border-b-blue-500' : 'text-slate-500'}`}
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              onClick={() => onDateClick(idx)}
              >
                {d.slice(5)}
              </div>
            ))}
        </div>

        <div className="min-w-max">
          {data.headers.map((keyword) => (
            <div key={keyword} className="flex hover:bg-slate-50 transition-colors border-b border-slate-50">
              <div className="sticky left-0 w-48 bg-white border-r border-slate-200 p-2 text-xs font-medium text-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-10 flex items-center truncate">
                {keyword}
              </div>
              {data.dates.map((date, cIdx) => {
                const rank = data.rows[cIdx][keyword] as number;
                return (
                  <div 
                    key={`${keyword}-${date}`} 
                    className={`w-10 h-8 flex-shrink-0 border-r border-slate-100 flex items-center justify-center text-[10px] transition-all duration-300 ${cIdx === currentIndex ? 'ring-2 ring-blue-500 z-10 scale-110 shadow-lg' : 'opacity-80'} ${rank === 0 ? 'bg-slate-50 text-slate-200' : rank <= 3 ? 'bg-emerald-500 text-white font-bold' : rank <= 10 ? 'bg-emerald-100 text-emerald-900 font-semibold' : 'bg-white text-slate-500'}`}
                  >
                    {rank > 0 ? rank : '-'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


// --- Main Application ---

export default function App() {
  const [data, setData] = useState<ParsedData>({ headers: [], rows: [], dates: [] });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<'curve' | 'grid' | 'monthly' | 'analytics'>('curve');
  const [playbackSpeed, setPlaybackSpeed] = useState(300); 
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Language & Persona States
  const [lang, setLang] = useState<'en' | 'zh'>('zh');

  // Translations
  const t: TranslationDictionary = {
    title: lang === 'zh' ? 'SEO 排名演進' : 'SEO Ranking Evolution',
    desc: lang === 'zh' ? '動態分析圖表' : 'Dynamic Bump Chart & Analytics',
    curve: lang === 'zh' ? '曲線圖' : 'Curve',
    grid: lang === 'zh' ? '熱力圖' : 'Grid',
    monthly: lang === 'zh' ? '月度摘要' : 'Monthly',
    analytics: lang === 'zh' ? '分析' : 'Analytics',
    importData: lang === 'zh' ? '匯入資料' : 'Import Data',
    uploadCsv: lang === 'zh' ? '上傳 CSV' : 'Upload CSV',
    fromGoogleSheet: lang === 'zh' ? '來自 Google 試算表' : 'From Google Sheet',
    loading: lang === 'zh' ? '載入資料中...' : 'Loading Data...',
    currentDate: lang === 'zh' ? '當前日期' : 'Current Date',
    fast: lang === 'zh' ? '快' : 'Fast',
    slow: lang === 'zh' ? '慢' : 'Slow',
    rank1: lang === 'zh' ? '排名第一' : 'Rank #1',
    ranked: lang === 'zh' ? '已入榜' : 'Ranked',
    rankingDetails: lang === 'zh' ? '排名詳情' : 'Ranking Details',
    stable: lang === 'zh' ? '穩定' : 'Stable',
    new: lang === 'zh' ? '新入榜' : 'NEW',
    dropped: lang === 'zh' ? '跌出榜單' : 'DROPPED',
    analyticsTitle: lang === 'zh' ? '排名穩定性分析' : 'Ranking Consistency Analysis',
    analyticsDesc: lang === 'zh' ? '計算關鍵字維持在特定排名內的天數。' : 'Calculate the number of days keywords maintained a specific rank.',
    startDate: lang === 'zh' ? '開始日期' : 'Start Date',
    endDate: lang === 'zh' ? '結束日期' : 'End Date',
    topX: lang === 'zh' ? '前 X 名' : 'Top X Rank',
    analysisScope: lang === 'zh' ? '分析範圍' : 'Analysis Period',
    duration: lang === 'zh' ? '區間長度' : 'Duration',
    days: lang === 'zh' ? '天' : 'days',
    filterCriteria: lang === 'zh' ? '篩選條件' : 'Filter Criteria',
    keywordsHolding: lang === 'zh' ? '關鍵字排名達到' : 'Keywords holding Rank',
    durationRate: lang === 'zh' ? '維持率 (持有時間)' : 'Duration Rate (time held)',
    monthlyHighlights: lang === 'zh' ? '月度亮點' : 'Monthly Highlights',
    totalRanked: lang === 'zh' ? '入榜總數' : 'Total Ranked',
    top3: lang === 'zh' ? '前 3 名' : 'Top 3',
    page1: lang === 'zh' ? '首頁 (前10)' : 'Page 1',
    dominance: lang === 'zh' ? '絕對優勢 (#1)' : 'Dominance (#1)',
    podium: lang === 'zh' ? '頒獎台 (#2-3)' : 'The Podium (#2-3)',
    page1Club: lang === 'zh' ? '首頁俱樂部 (#4-10)' : 'Page 1 Club (#4-10)',
    radar: lang === 'zh' ? '雷達區 (11+)' : 'On The Radar (11+)',
    unranked: lang === 'zh' ? '未入榜 / 失去曝光' : 'Currently Unranked / Lost Visibility',
  };

  // Import States
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const importMenuRef = useRef<HTMLDivElement>(null);

  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);
  const monthlySnapshots = useMemo(() => getMonthlySnapshots(data.dates), [data.dates]);

  // Unified fetcher for Google Sheets with cache busting
  const fetchGoogleSheet = async (url: string) => {
      setIsLoading(true);
      setLoadError('');
      
      let fetchUrl = url;
      const exportUrl = getCsvExportUrl(url);
      if (exportUrl) {
        fetchUrl = exportUrl;
      }

      try {
        let response;
        try {
          // 嘗試直接讀取，加入 credentials: 'omit' 來避免瀏覽器發送 Cookie 導致的嚴格 CORS 拒絕
          response = await fetch(fetchUrl, { credentials: 'omit' });
        } catch (directError) {
          console.warn("Direct fetch failed (likely CORS or Sandbox restrictions), falling back to proxy:", directError);
          // 若發生 CORS 或網路錯誤，降級使用 AllOrigins 代理服務來繞過同源策略 (CORS) 限制
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fetchUrl)}`;
          response = await fetch(proxyUrl);
        }

        if (!response.ok) {
           if (response.status === 404) throw new Error("Sheet not found. Check permissions?");
           throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        
        const text = await response.text();
        if (text.trim().toLowerCase().startsWith('<!doctype html>')) {
           throw new Error('Received HTML instead of CSV. Is the sheet public?');
        }

        const parsed = parseCSV(text);
        if (parsed.headers.length === 0) throw new Error('Invalid CSV format or empty sheet');
        
        setData(parsed);
        // Automatically jump to the very latest date available
        setCurrentIndex(Math.max(0, parsed.dates.length - 1));
        setIsPlaying(false);
        return true;
     } catch (error: any) {
        console.error("Import Error:", error);
        setLoadError(error.message || "Failed to load");
        return false;
     } finally {
        setIsLoading(false);
     }
  };

  useEffect(() => {
    fetchGoogleSheet(DEFAULT_SHEET_URL);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && data.dates.length > 0 && viewMode === 'curve') {
      interval = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= data.dates.length - 1) {
            return 0; // 當達到最後一筆資料時，歸零以實作無限循環播放
          }
          return prev + 1;
        });
      }, playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, data.dates.length, playbackSpeed, viewMode]);

  useEffect(() => {
    if (viewMode === 'grid' && scrollContainerRef.current) {
      const colWidth = 40; 
      const scrollPos = (currentIndex * colWidth) - (scrollContainerRef.current.clientWidth / 2) + colWidth;
      scrollContainerRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
    }
  }, [currentIndex, viewMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const parsed = parseCSV(event.target?.result as string);
        setData(parsed);
        setCurrentIndex(parsed.dates.length - 1);
        setIsPlaying(false);
      };
      reader.readAsText(file);
      setIsImportMenuOpen(false);
    }
  };

  const handleUserImportSubmit = async () => {
     if (!googleSheetUrl) return;
     const success = await fetchGoogleSheet(googleSheetUrl);
     if (success) {
        setShowUrlInput(false);
        setGoogleSheetUrl('');
        setIsImportMenuOpen(false);
     }
  };

  const currentDate = data.dates[currentIndex] || '';
  const currentRow = data.rows[currentIndex] || {};
  const prevRow = currentIndex > 0 ? data.rows[currentIndex - 1] : null;

  const currentStats: KeywordStat[] = useMemo(() => {
    if (!currentRow) return [];
    return data.headers.map((keyword, idx) => {
      const rank = currentRow[keyword] as number;
      const prevRank = prevRow ? (prevRow[keyword] as number) : rank;
      let diff = 0;
      if (prevRank > 0 && rank > 0) {
        diff = prevRank - rank;
      }

      return {
        keyword,
        rank,
        prevRank,
        diff,
        isNew: prevRank === 0 && rank > 0,
        dropped: rank === 0 && prevRank > 0,
        color: getKeywordColor(idx)
      };
    });
  }, [currentRow, prevRow, data.headers]);

  const top1Count = currentStats.filter(s => s.rank === 1).length;
  const rankedCount = currentStats.filter(s => s.rank > 0).length;

  return (
    <div className="absolute inset-0 flex flex-col w-full bg-slate-100 text-slate-900 overflow-hidden font-mju isolate">
      
      {/* Dynamic Font Injection & Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @font-face {
           font-family: 'Microsoft JhengHei UI';
           src: local('Microsoft JhengHei UI'), local('Microsoft JhengHei');
        }
        .font-mju { font-family: 'Microsoft JhengHei UI', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />

      {/* Main Desktop Header Row */}
      {/* 
          CRITICAL FIX: pt-10 md:pt-12 creates a massive 40px~48px top bumper.
          This forces ALL interactive elements down, completely escaping the Gemini/Chrome
          invisible system-level overlay "Dead Zone" at the top of the iframe.
      */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 pt-10 md:pt-12 pb-4 flex items-center justify-between shadow-sm z-[9999] relative w-full min-h-[90px] isolate shrink-0">
        
        {/* Left: Logo Block (Scaled up by 150%) */}
        <div className="flex-1 flex justify-start items-center gap-3 relative z-[10001]">
           <img src="https://upload.cc/i1/2026/01/29/BauOeN.png" alt="CIS Logo" className="h-[42px] md:h-[48px] w-auto object-contain" />
           <div>
             <h1 className="text-base md:text-lg font-bold text-slate-800 leading-tight">{t.title} <span className="text-blue-600">V5.0</span></h1>
             <p className="text-[10px] md:text-xs text-slate-500">{t.desc}</p>
           </div>
        </div>

        {/* Center: Desktop Function Tabs (Flex-1 allocation creates perfect centering without absolute positioning traps) */}
        <div className="hidden lg:flex justify-center items-center shrink-0 relative z-[10002]">
           <div className="bg-slate-100 p-1.5 rounded-lg flex items-center gap-1 border border-slate-200 shadow-sm pointer-events-auto">
             <button 
               type="button"
               onClick={() => setViewMode('curve')}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'curve' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
             >
               <TrendingUp size={16} className="pointer-events-none" /> {t.curve}
             </button>
             <button 
               type="button"
               onClick={() => setViewMode('grid')}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
             >
               <Grid size={16} className="pointer-events-none" /> {t.grid}
             </button>
             <button 
               type="button"
               onClick={() => setViewMode('monthly')}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
             >
               <LayoutGrid size={16} className="pointer-events-none" /> {t.monthly}
             </button>
             <button 
               type="button"
               onClick={() => setViewMode('analytics')}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
             >
               <BarChart2 size={16} className="pointer-events-none" /> {t.analytics}
             </button>
           </div>
        </div>

        {/* Right: Lang & Import Block */}
        <div className="flex-1 flex justify-end items-center gap-2 relative z-[10001]">
          {/* Language Toggle */}
          <button 
             type="button"
             onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
             className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors shadow-sm cursor-pointer select-none"
          >
             <Globe size={16} className="pointer-events-none" />
             {lang === 'zh' ? 'EN' : '中'}
          </button>

          {/* Import Menu */}
          <div className="relative" ref={importMenuRef}>
            <button 
              type="button"
              onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors shadow-sm cursor-pointer select-none"
            >
              <Upload size={16} className="pointer-events-none" /> <span className="hidden sm:inline pointer-events-none">{t.importData}</span> <ChevronDown size={14} className={`transition-transform pointer-events-none ${isImportMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isImportMenuOpen && (
               <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-[12000] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-1">
                     <label className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors text-slate-700 text-sm font-medium">
                        <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                           <FileText size={16} />
                        </div>
                        <div className="flex flex-col items-start">
                           <span>{t.uploadCsv}</span>
                           <span className="text-[10px] text-slate-400">Local file (.csv)</span>
                        </div>
                     </label>
                     
                     <button 
                       type="button"
                       onClick={() => { setShowUrlInput(true); setIsImportMenuOpen(false); }}
                       className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors text-slate-700 text-sm font-medium text-left"
                     >
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                           <Link size={16} />
                        </div>
                        <div className="flex flex-col items-start">
                           <span>{t.fromGoogleSheet}</span>
                           <span className="text-[10px] text-slate-400">Published URL</span>
                        </div>
                     </button>
                  </div>
               </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile / Tablet Tabs (Shown when width < lg) */}
      <div className="lg:hidden w-full bg-white border-b border-slate-200 px-4 py-2 overflow-x-auto hide-scrollbar z-[9998] relative shadow-sm shrink-0 isolate">
         <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1 border border-slate-200 w-max mx-auto pointer-events-auto">
           <button 
             type="button"
             onClick={() => setViewMode('curve')}
             className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'curve' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
           >
             <TrendingUp size={16} className="pointer-events-none" /> {t.curve}
           </button>
           <button 
             type="button"
             onClick={() => setViewMode('grid')}
             className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
           >
             <Grid size={16} className="pointer-events-none" /> {t.grid}
           </button>
           <button 
             type="button"
             onClick={() => setViewMode('monthly')}
             className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
           >
             <LayoutGrid size={16} className="pointer-events-none" /> {t.monthly}
           </button>
           <button 
             type="button"
             onClick={() => setViewMode('analytics')}
             className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all cursor-pointer select-none ${viewMode === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'}`}
           >
             <BarChart2 size={16} className="pointer-events-none" /> {t.analytics}
           </button>
         </div>
      </div>

      {/* Google Sheet URL Modal */}
      {showUrlInput && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 w-full h-full">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
              <button onClick={() => { setShowUrlInput(false); setLoadError(''); }} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                    <Link size={20} />
                 </div>
                 <div>
                    <h3 className="font-bold text-slate-800">Connect Google Sheet</h3>
                    <p className="text-xs text-slate-500">Import live data from a published sheet</p>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600">
                    <p className="font-bold mb-1 text-slate-700">How to get the link:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                       <li>Open your Google Sheet</li>
                       <li>Paste the browser URL (we'll handle the conversion!)</li>
                       <li>OR: File {'>'} Share {'>'} Publish to web (CSV format)</li>
                       <li><strong>Note:</strong> Sheet must be Public or Published to Web</li>
                    </ol>
                 </div>

                 <input 
                   type="text" 
                   value={googleSheetUrl}
                   onChange={(e) => setGoogleSheetUrl(e.target.value)}
                   placeholder="https://docs.google.com/spreadsheets/d/..."
                   className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                 />
                 
                 {loadError && (
                    <div className="text-red-500 text-xs bg-red-50 p-2 rounded border border-red-100">
                       Error: {loadError}
                    </div>
                 )}

                 <button 
                   onClick={handleUserImportSubmit}
                   disabled={!googleSheetUrl || isLoading}
                   className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
                 >
                    {isLoading ? <RefreshCw className="animate-spin" size={16} /> : t.importData}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Main Stage */}
      <div className="flex flex-1 overflow-hidden w-full relative bg-slate-50 z-0 isolate">
        
        {/* Loading Overlay */}
        {isLoading && !showUrlInput && (
           <div className="absolute inset-0 z-[15000] bg-white/80 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                 <RefreshCw className="animate-spin text-blue-600" size={32} />
                 <p className="text-sm font-medium text-slate-600">{t.loading}</p>
              </div>
           </div>
        )}

        {viewMode === 'monthly' ? (
           <div className="flex flex-col w-full h-full bg-slate-50">
             <div className="bg-white border-b border-slate-200 p-4 flex gap-2 overflow-x-auto w-full">
               {monthlySnapshots.map((snap, idx) => (
                 <button 
                   key={snap.date}
                   onClick={() => setSelectedSnapshotIndex(idx)}
                   className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap cursor-pointer select-none ${selectedSnapshotIndex === idx ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                 >
                   {snap.monthLabel}
                 </button>
               ))}
               {monthlySnapshots.length === 0 && <span className="text-sm text-slate-400">No data available</span>}
             </div>
             
             {monthlySnapshots.length > 0 && (
                <BentoGridView 
                  data={data} 
                  snapshot={monthlySnapshots[selectedSnapshotIndex]}
                  prevSnapshot={monthlySnapshots[selectedSnapshotIndex + 1]}
                  t={t}
                />
             )}
           </div>
        ) : viewMode === 'analytics' ? (
           <div className="flex-1 w-full h-full flex flex-col overflow-hidden bg-slate-50">
              <AnalyticsView data={data} t={t} />
           </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col overflow-hidden relative bg-slate-50">
              <div className="flex-1 relative overflow-hidden w-full">
                {viewMode === 'curve' ? (
                  <CurveRaceView data={data} stats={currentStats} currentIndex={currentIndex} playbackSpeed={playbackSpeed} />
                ) : (
                  <HeatmapView data={data} currentIndex={currentIndex} onDateClick={setCurrentIndex} scrollRef={scrollContainerRef} />
                )}
              </div>
              
              <div className="h-20 bg-white border-t border-slate-200 px-6 py-3 flex flex-col justify-center shrink-0 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] w-full">
                 <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4 min-w-[200px]">
                      <button 
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer select-none ${isPlaying ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'}`}
                      >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
                      </button>
                      <div>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">{t.currentDate}</span>
                        <span className="text-xl font-bold text-slate-800 font-mju">{currentDate}</span>
                      </div>
                    </div>
                    <div className="flex-1 relative h-6 flex items-center group mx-4">
                      <div className="absolute inset-x-0 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300" 
                          style={{ width: `${(currentIndex / Math.max(1, data.dates.length - 1)) * 100}%` }}
                        />
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max={Math.max(0, data.dates.length - 1)} 
                        value={currentIndex} 
                        onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-ew-resize z-10"
                      />
                      <div 
                        className="w-4 h-4 bg-white border-2 border-blue-600 rounded-full absolute shadow-md pointer-events-none transition-all duration-300 group-hover:scale-125"
                        style={{ left: `${(currentIndex / Math.max(1, data.dates.length - 1)) * 100}%`, transform: 'translateX(-50%)' }}
                      />
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                       <Gauge size={16} className="text-slate-500" />
                       <div className="flex flex-col w-24">
                         <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                           <span>{t.fast}</span>
                           <span>{t.slow}</span>
                         </div>
                         <input 
                           type="range" 
                           min="50" 
                           max="1000" 
                           step="50"
                           value={playbackSpeed}
                           onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                           className="h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                         />
                       </div>
                    </div>
                    <div className="flex gap-4 text-sm justify-end border-l border-slate-200 pl-4">
                       <div className="flex flex-col items-center">
                          <span className="text-slate-400 text-xs">{t.rank1}</span>
                          <span className="font-bold text-slate-700">{top1Count}</span>
                       </div>
                       <div className="flex flex-col items-center">
                          <span className="text-slate-400 text-xs">{t.ranked}</span>
                          <span className="font-bold text-blue-600">{rankedCount}</span>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            <div className="w-72 bg-white border-l border-slate-200 flex flex-col shadow-xl z-30 shrink-0">
              <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-xs">
                  <Calendar size={14} className="text-slate-500" />
                  {t.rankingDetails}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar w-full">
                {currentStats
                  .sort((a, b) => {
                    if (a.rank === 0 && b.rank === 0) return 0;
                    if (a.rank === 0) return 1;
                    if (b.rank === 0) return -1;
                    return a.rank - b.rank; 
                  })
                  .map((stat) => (
                  <div key={stat.keyword} className="bg-white border border-slate-100 rounded p-1.5 hover:border-blue-200 transition-colors group flex flex-col gap-0.5 shadow-sm">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                         <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stat.color }}></div>
                         <span className="font-medium text-slate-700 text-[10px] truncate w-32" title={stat.keyword}>{stat.keyword}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded-sm shrink-0 leading-none ${stat.rank > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-300'}`}>
                        {stat.rank > 0 ? `#${stat.rank}` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] pl-3 leading-none">
                       {stat.isNew ? (
                         <span className="text-emerald-600 font-bold flex items-center gap-0.5 bg-emerald-50 px-0.5 rounded">{t.new}</span>
                       ) : stat.dropped ? (
                         <span className="text-red-400 font-bold flex items-center gap-0.5 bg-red-50 px-0.5 rounded">{t.dropped}</span>
                       ) : stat.diff > 0 ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-0.5"><TrendingUp size={8} /> +{stat.diff}</span>
                       ) : stat.diff < 0 ? (
                        <span className="text-red-500 font-bold flex items-center gap-0.5"><TrendingDown size={8} /> -{Math.abs(stat.diff)}</span>
                       ) : (
                        <span className="text-slate-300 flex items-center gap-0.5"><Minus size={8} /> {t.stable}</span>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
      
    </div>
  );
}