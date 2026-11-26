// 费用模型（练习参数，用户可在“我的 → 费用设置”中修改）。
//   佣金：券商自定，常见为成交金额的万分之几并设最低收费，此处默认值仅为练习参数，不代表任何券商实际费率。
//   印花税：2023-08-28 起减半征收，仅卖出方按成交金额 0.05% 缴纳（财政部 税务总局公告 2023 年第 39 号）。
//   过户费：中国结算自 2022-04-29 起沪深股票按成交金额 0.001% 双向收取；北交所收费请自行核对，默认不计。
//   经手费、证管费等通常包含在券商佣金中，未单独列示。
import { round2 } from './rules.js';

export const DEFAULT_FEES = Object.freeze({
  commissionRate: 0.00025,
  commissionMin: 5,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
  transferFeeExchanges: ['SH', 'SZ'],
});

export function normalizeFees(cfg = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    commissionRate: num(cfg.commissionRate, DEFAULT_FEES.commissionRate),
    commissionMin: num(cfg.commissionMin, DEFAULT_FEES.commissionMin),
    stampDutyRate: num(cfg.stampDutyRate, DEFAULT_FEES.stampDutyRate),
    transferFeeRate: num(cfg.transferFeeRate, DEFAULT_FEES.transferFeeRate),
    transferFeeExchanges: Array.isArray(cfg.transferFeeExchanges)
      ? cfg.transferFeeExchanges.filter((x) => ['SH', 'SZ', 'BJ'].includes(x))
      : [...DEFAULT_FEES.transferFeeExchanges],
  };
}

const pct = (r) => `${+(r * 100).toFixed(4)}%`;

/** 计算一笔成交的费用明细；每项按分四舍五入 */
export function calcFees({ side, amount, exchange }, cfgIn) {
  const cfg = normalizeFees(cfgIn);
  if (!(amount > 0)) return { commission: 0, stampDuty: 0, transferFee: 0, total: 0, basis: [] };
  const commissionRaw = amount * cfg.commissionRate;
  const commission = round2(Math.max(commissionRaw, cfg.commissionMin));
  const stampDuty = side === 'sell' ? round2(amount * cfg.stampDutyRate) : 0;
  const transferApplies = cfg.transferFeeExchanges.includes(exchange);
  const transferFee = transferApplies ? round2(amount * cfg.transferFeeRate) : 0;
  const total = round2(commission + stampDuty + transferFee);
  const basis = [
    `佣金 = max(成交额 × ${pct(cfg.commissionRate)}, 最低 ¥${cfg.commissionMin})`
      + (commissionRaw < cfg.commissionMin ? '，已按最低收费' : ''),
    side === 'sell' ? `印花税 = 成交额 × ${pct(cfg.stampDutyRate)}（仅卖出）` : '印花税：买入不收',
    transferApplies ? `过户费 = 成交额 × ${pct(cfg.transferFeeRate)}` : `过户费：${exchange} 未配置收取`,
  ];
  return { commission, stampDuty, transferFee, total, basis };
}
