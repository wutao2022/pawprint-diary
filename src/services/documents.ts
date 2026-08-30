import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { CARE_LABELS, HEALTH_LABELS, daysBetween } from '../constants';
import { listAttachments, listCareRecords, listHealthRecords, listTimeline } from '../data/repository';
import { Pet } from '../types';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function generateVisitSummary(pet: Pet): Promise<string> {
  const [health, care, attachments] = await Promise.all([
    listHealthRecords(pet.id), listCareRecords(pet.id), listAttachments(pet.id),
  ]);
  const healthRows = health.slice(0, 30).map((item) => `<tr><td>${escapeHtml(item.occurred_at)}</td><td>${escapeHtml(HEALTH_LABELS[item.type])}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.diagnosis || item.symptoms || item.notes)}</td></tr>`).join('');
  const careRows = care.slice(0, 30).map((item) => `<tr><td>${escapeHtml(item.occurred_at)}</td><td>${escapeHtml(CARE_LABELS[item.category])}</td><td>${escapeHtml(item.title)}</td><td>${item.action === 'completed' ? '已完成' : '已跳过'}</td></tr>`).join('');
  const weight = health.filter((item) => item.type === 'weight').slice(0, 8).map((item) => `${item.occurred_at}: ${item.weight ?? '-'} kg`).join('；');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{margin:24px}body{font-family:sans-serif;color:#26332A;font-size:12px}h1{color:#48654D}h2{margin-top:20px;color:#6F8F72}
    .meta{background:#F8F5EE;padding:14px;border-radius:10px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #DFE5DD;text-align:left}
    small{color:#6D786F}</style></head><body>
    <h1>${escapeHtml(pet.name)} · 就诊摘要</h1><p><small>由爪印日记在本机生成 · ${new Date().toLocaleString('zh-CN')}</small></p>
    <div class="meta"><b>物种/品种：</b>${escapeHtml(pet.species)} ${escapeHtml(pet.breed)}<br><b>生日：</b>${escapeHtml(pet.birth_date || '未填写')}<br>
    <b>芯片号：</b>${escapeHtml(pet.microchip || '未填写')}<br><b>过敏：</b>${escapeHtml(pet.allergies || '无记录')}<br>
    <b>慢性病：</b>${escapeHtml(pet.chronic_conditions || '无记录')}<br><b>长期用药：</b>${escapeHtml(pet.long_term_medications || '无记录')}</div>
    <h2>最近体重</h2><p>${escapeHtml(weight || '无记录')}</p>
    <h2>健康与就诊</h2><table><tr><th>日期</th><th>类型</th><th>标题</th><th>详情</th></tr>${healthRows || '<tr><td colspan="4">无记录</td></tr>'}</table>
    <h2>疫苗与护理历史</h2><table><tr><th>日期</th><th>类别</th><th>项目</th><th>状态</th></tr>${careRows || '<tr><td colspan="4">无记录</td></tr>'}</table>
    <h2>资料附件清单</h2><p>${attachments.map((item) => `${escapeHtml(item.occurred_at)} · ${escapeHtml(item.display_name)}`).join('<br>') || '无附件'}</p>
    <p><small>本摘要仅整理用户记录，不提供疾病诊断，也不能替代宠物医生。</small></p></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${pet.name} 就诊摘要` });
  return uri;
}

export async function generateAnnualMemoryPdf(pet: Pet, year = new Date().getFullYear()): Promise<string> {
  const [timeline, health, care] = await Promise.all([listTimeline(pet.id), listHealthRecords(pet.id), listCareRecords(pet.id)]);
  const yearText = String(year);
  const entries = timeline.filter((item) => item.occurred_at.startsWith(yearText));
  const weights = health.filter((item) => item.type === 'weight' && item.occurred_at.startsWith(yearText));
  const completed = care.filter((item) => item.action === 'completed' && item.occurred_at.startsWith(yearText)).length;
  const first = weights.at(-1)?.weight;
  const last = weights.at(0)?.weight;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}body{margin:0;font-family:sans-serif;background:#F8F5EE;color:#26332A}.card{padding:40px;min-height:1000px;background:linear-gradient(#DDEADF,#F8F5EE)}h1{font-size:38px;color:#48654D}.big{font-size:60px;color:#E98266}.grid{display:flex;gap:12px}.tile{flex:1;background:white;padding:20px;border-radius:18px}li{margin:12px 0}</style></head><body><div class="card"><p>${year} 年度回忆</p><h1>${escapeHtml(pet.name)} 的这一年</h1><div class="big">${entries.length}</div><p>个成长瞬间被好好保存</p><div class="grid"><div class="tile"><b>完成护理</b><br>${completed} 次</div><div class="tile"><b>体重变化</b><br>${first ?? '-'} → ${last ?? '-'} kg</div><div class="tile"><b>陪伴天数</b><br>${daysBetween(pet.home_date) ?? '-'} 天</div></div><h2>难忘时刻</h2><ul>${entries.slice(0, 12).map((item) => `<li>${escapeHtml(item.occurred_at)} · ${escapeHtml(item.title)}</li>`).join('') || '<li>从今天开始记录吧</li>'}</ul><p>所有内容均在本机生成，没有上传照片和健康资料。</p></div></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${pet.name} ${year} 年度回忆` });
  return uri;
}

export { escapeHtml };
