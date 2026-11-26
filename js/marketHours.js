// 美股（NYSE / NASDAQ）交易时段、法定节假日与提前休市日历引擎
// 绝不仅凭星期与钟点猜测开市状态；完整处理美东夏令时/冬令时、美国市场法定节假日、提前休市日及数据源实时状态覆盖。

function formatYmd(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function observedDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  if (dow === 6) {
    const fri = new Date(Date.UTC(year, month - 1, day - 1));
    return formatYmd(fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate());
  }
  if (dow === 0) {
    const mon = new Date(Date.UTC(year, month - 1, day + 1));
    return formatYmd(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
  }
  return formatYmd(year, month, day);
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return formatYmd(year, month, day);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return formatYmd(year, month, last.getUTCDate() - offset);
}

// Meeus/Jones/Butcher 格里高利历复活节算法 -> 耶稣受难日 Good Friday 为复活节前 2 天
function goodFriday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const gf = new Date(Date.UTC(year, month - 1, day - 2));
  return formatYmd(gf.getUTCFullYear(), gf.getUTCMonth() + 1, gf.getUTCDate());
}

const calendarCache = new Map();

export function getUSMarketCalendar(year) {
  if (calendarCache.has(year)) return calendarCache.get(year);

  const holidays = new Map();

  // 元旦 New Year's Day（NYSE 规则：若 1 月 1 日为周日则 1 月 2 日补休；若为周六则前一年 12 月 31 日不休市）
  const jan1 = new Date(Date.UTC(year, 0, 1));
  if (jan1.getUTCDay() === 0) {
    holidays.set(formatYmd(year, 1, 2), { en: "New Year's Day (Observed)", zh: '元旦补休' });
  } else if (jan1.getUTCDay() !== 6) {
    holidays.set(formatYmd(year, 1, 1), { en: "New Year's Day", zh: '元旦' });
  }

  holidays.set(nthWeekdayOfMonth(year, 1, 1, 3), { en: 'Martin Luther King Jr. Day', zh: '马丁·路德·金纪念日' });
  holidays.set(nthWeekdayOfMonth(year, 2, 1, 3), { en: "Presidents' Day", zh: '总统日' });
  holidays.set(goodFriday(year), { en: 'Good Friday', zh: '耶稣受难日' });
  holidays.set(lastWeekdayOfMonth(year, 5, 1), { en: 'Memorial Day', zh: '阵亡将士纪念日' });
  holidays.set(observedDate(year, 6, 19), { en: 'Juneteenth National Independence Day', zh: '六月节' });
  holidays.set(observedDate(year, 7, 4), { en: 'Independence Day', zh: '美国独立日' });
  holidays.set(nthWeekdayOfMonth(year, 9, 1, 1), { en: 'Labor Day', zh: '美国劳工节' });

  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  holidays.set(thanksgiving, { en: 'Thanksgiving Day', zh: '感恩节' });
  holidays.set(observedDate(year, 12, 25), { en: 'Christmas Day', zh: '圣诞节' });

  // 提前休市日（美东 13:00 收盘）
  const earlyCloses = new Map();

  const jul3 = new Date(Date.UTC(year, 6, 3));
  const jul3Key = formatYmd(year, 7, 3);
  if (jul3.getUTCDay() >= 1 && jul3.getUTCDay() <= 5 && !holidays.has(jul3Key)) {
    earlyCloses.set(jul3Key, { en: 'Independence Day Eve (Early Close 13:00 ET)', zh: '独立日前夕（13:00 ET 提前休市）' });
  }

  const [ty, tm, td] = thanksgiving.split('-').map(Number);
  const blackFriday = new Date(Date.UTC(ty, tm - 1, td + 1));
  const bfKey = formatYmd(blackFriday.getUTCFullYear(), blackFriday.getUTCMonth() + 1, blackFriday.getUTCDate());
  earlyCloses.set(bfKey, { en: 'Day After Thanksgiving (Early Close 13:00 ET)', zh: '感恩节次日（13:00 ET 提前休市）' });

  const dec24 = new Date(Date.UTC(year, 11, 24));
  const dec24Key = formatYmd(year, 12, 24);
  if (dec24.getUTCDay() >= 1 && dec24.getUTCDay() <= 5 && !holidays.has(dec24Key)) {
    earlyCloses.set(dec24Key, { en: 'Christmas Eve (Early Close 13:00 ET)', zh: '平安夜（13:00 ET 提前休市）' });
  }

  const cal = { holidays, earlyCloses };
  calendarCache.set(year, cal);
  return cal;
}

export function getETParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  return {
    year,
    month,
    day,
    weekday: parts.weekday,
    hour,
    minute,
    second,
    ymd: formatYmd(year, month, day),
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
    minutesOfDay: hour * 60 + minute
  };
}

/**
 * 计算美股（NYSE / NASDAQ）精确市场状态
 * @param {Date} now 当前时间
 * @param {object|null} apiMarketState 可选的 Twelve Data /market_state 实时响应
 */
export function getUSMarketStatus(now = new Date(), apiMarketState = null) {
  const et = getETParts(now);
  const { holidays, earlyCloses } = getUSMarketCalendar(et.year);
  const holiday = holidays.get(et.ymd) || null;
  const earlyClose = earlyCloses.get(et.ymd) || null;
  const isWeekend = et.weekday === 'Sat' || et.weekday === 'Sun';

  let session = 'closed';
  let labelZh = '休市';
  let labelEn = 'Closed';
  let detail = '';
  let source = 'NYSE/NASDAQ 交易日历';

  if (holiday) {
    session = 'holiday';
    labelZh = `美国假期休市 · ${holiday.zh}`;
    labelEn = `US Holiday (${holiday.en})`;
    detail = `${holiday.zh} (${holiday.en}) 全天休市`;
  } else if (isWeekend) {
    session = 'weekend';
    labelZh = '周末休市';
    labelEn = 'Weekend Closed';
    detail = 'NYSE / NASDAQ 周末休市';
  } else {
    const regularOpen = 9 * 60 + 30;
    const regularClose = earlyClose ? 13 * 60 : 16 * 60;
    const preOpen = 4 * 60;
    const afterClose = earlyClose ? 17 * 60 : 20 * 60;

    if (et.minutesOfDay >= preOpen && et.minutesOfDay < regularOpen) {
      session = 'pre-market';
      labelZh = '盘前交易';
      labelEn = 'Pre-Market';
      detail = earlyClose ? `04:00–09:30 ET · ${earlyClose.zh}` : '04:00–09:30 ET（盘前时段）';
    } else if (et.minutesOfDay >= regularOpen && et.minutesOfDay < regularClose) {
      session = 'regular';
      labelZh = earlyClose ? '常规交易（提前休市日）' : '常规交易时段';
      labelEn = earlyClose ? 'Regular (Early Close)' : 'Regular Market';
      detail = earlyClose ? `09:30–13:00 ET · ${earlyClose.zh}` : '09:30–16:00 ET（盘中连续竞价）';
    } else if (et.minutesOfDay >= regularClose && et.minutesOfDay < afterClose) {
      session = 'after-hours';
      labelZh = '盘后交易';
      labelEn = 'After-Hours';
      detail = earlyClose ? '13:00–17:00 ET（提前休市日盘后）' : '16:00–20:00 ET（盘后时段）';
    } else {
      session = 'closed';
      labelZh = '夜间休市';
      labelEn = 'Market Closed';
      detail = '美东 20:00 – 次日 04:00 休市';
    }
  }

  // 若数据源 /market_state 返回了明确的交易所开闭状态，则在异常停市或校正时予以采用
  if (apiMarketState && typeof apiMarketState.is_market_open === 'boolean') {
    source = 'Twelve Data + NYSE/NASDAQ 日历';
    if (session === 'regular' && !apiMarketState.is_market_open) {
      session = 'closed';
      labelZh = '交易所休市';
      labelEn = 'Exchange Closed';
      detail = '数据源回报当前交易所未开市（如临时停盘或特殊休市）';
    } else if (session !== 'regular' && apiMarketState.is_market_open) {
      session = 'regular';
      labelZh = '常规交易时段';
      labelEn = 'Regular Market';
      detail = '数据源确认交易所当前开市';
    }
  }

  const dateZh = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(now);

  return {
    session, // 'regular' | 'pre-market' | 'after-hours' | 'weekend' | 'holiday' | 'closed'
    isRegularOpen: session === 'regular',
    isExtendedHours: session === 'pre-market' || session === 'after-hours',
    isClosed: session === 'weekend' || session === 'holiday' || session === 'closed',
    labelZh,
    labelEn,
    detail,
    source,
    holiday,
    earlyClose,
    etTime: et.timeStr,
    etDateZh: dateZh,
    ymd: et.ymd
  };
}
