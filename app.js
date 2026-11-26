const stocks=[
 {symbol:'AAPL',name:'Apple Inc.',tone:'white',exchange:'NASDAQ'},
 {symbol:'NVDA',name:'NVIDIA Corporation',tone:'green',exchange:'NASDAQ'},
 {symbol:'MSFT',name:'Microsoft Corporation',tone:'blue',exchange:'NASDAQ'},
 {symbol:'TSLA',name:'Tesla, Inc.',tone:'red',exchange:'NASDAQ'},
 {symbol:'AMZN',name:'Amazon.com, Inc.',tone:'orange',exchange:'NASDAQ'},
 {symbol:'GOOGL',name:'Alphabet Inc.',tone:'blue',exchange:'NASDAQ'},
 {symbol:'META',name:'Meta Platforms, Inc.',tone:'blue',exchange:'NASDAQ'},
 {symbol:'NFLX',name:'Netflix, Inc.',tone:'red',exchange:'NASDAQ'},
 {symbol:'AMD',name:'Advanced Micro Devices',tone:'red',exchange:'NASDAQ'},
 {symbol:'DIS',name:'The Walt Disney Company',tone:'blue',exchange:'NYSE'}
];
const indexDefs=[{symbol:'SPX',label:'S&P 500'},{symbol:'IXIC',label:'NASDAQ'},{symbol:'DJI',label:'DOW'},{symbol:'VIX',label:'VIX'}];
const initialCash=100000,$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state={cash:initialCash,positions:{},watchlist:['NVDA','AAPL'],trades:[],orders:[]},quotes={},seriesCache={},selected='AAPL',filter='all',side='buy',range='1D',apiKey=sessionStorage.getItem('papertrade-market-key')||'',lastSync=0,syncing=false;
try{const saved=JSON.parse(localStorage.getItem('papertrade-state'));if(saved&&typeof saved.cash==='number')state={...state,...saved,orders:saved.orders||[]};const cached=JSON.parse(localStorage.getItem('papertrade-quotes'));if(cached&&typeof cached==='object')quotes=cached}catch(e){}
const fmt=(n,d=2)=>Number.isFinite(Number(n))?'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const signed=n=>(n>=0?'+':'−')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>Number.isFinite(Number(n))?(n>=0?'+':'')+Number(n).toFixed(2)+'%':'—';
function save(){localStorage.setItem('papertrade-state',JSON.stringify(state))}
function getStock(s){return stocks.find(x=>x.symbol===s)}
function q(s){return quotes[s]||null}
function px(s){return Number(q(s)?.price)||0}
function marketValue(){return Object.entries(state.positions).reduce((n,e)=>n+px(e[0])*(e[1].qty||0),0)}
function missingPositionQuotes(){return Object.keys(state.positions).some(s=>state.positions[s].qty>0&&!q(s))}
function freshQuote(s){return !!q(s)&&Date.now()-(q(s)._received||0)<15*60*1000}
function totalValue(){return state.cash+marketValue()}
function reservedCash(){return state.orders.filter(o=>o.status==='pending'&&o.side==='buy').reduce((n,o)=>n+o.qty*o.limitPrice,0)}
function reservedShares(s){return state.orders.filter(o=>o.status==='pending'&&o.side==='sell'&&o.symbol===s).reduce((n,o)=>n+o.qty,0)}
function availableCash(except){return Math.max(0,state.cash-state.orders.filter(o=>o.status==='pending'&&o.side==='buy'&&o.id!==except).reduce((n,o)=>n+o.qty*o.limitPrice,0))}
function availableShares(s,except){return Math.max(0,(state.positions[s]?.qty||0)-state.orders.filter(o=>o.status==='pending'&&o.side==='sell'&&o.symbol===s&&o.id!==except).reduce((n,o)=>n+o.qty,0))}
function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),2400)}
function setQuote(symbol,d){const p=Number(d.close||d.price||d.last);if(!Number.isFinite(p)||p<=0)throw new Error('无效报价');quotes[symbol]={price:p,_received:Date.now(),open:Number(d.open)||null,high:Number(d.high)||null,low:Number(d.low)||null,volume:Number(d.volume)||null,change:Number(d.change)||null,percent:Number(d.percent_change)||null,datetime:d.datetime||'',timestamp:Number(d.timestamp)||Math.floor(Date.now()/1000),_received:Date.now()};seriesCache={}}
async function fetchQuote(symbol){if(q(symbol)&&Date.now()-q(symbol)._received<120000)return;const r=await fetch('https://api.twelvedata.com/quote?symbol='+encodeURIComponent(symbol),{headers:{Authorization:'apikey '+apiKey},cache:'no-store'});const d=await r.json();if(!r.ok||d.status==='error'||d.code)throw new Error(d.message||'行情请求失败');setQuote(symbol,d)}
async function syncQuotes(){
 if(!apiKey||syncing)return;syncing=true;$('#market-badge').textContent='同步中';$('#settings-status').textContent='正在同步报价…';
 const symbols=stocks.map(s=>s.symbol).concat(indexDefs.map(s=>s.symbol));let ok=0,fail=0;
 for(let i=0;i<symbols.length;i+=7){const res=await Promise.allSettled(symbols.slice(i,i+7).map(fetchQuote));res.forEach(x=>x.status==='fulfilled'?ok++:fail++);renderAll();if(i+7<symbols.length)await new Promise(r=>setTimeout(r,61000))}
 syncing=false;lastSync=Date.now();$('#market-badge').textContent=fail?'部分更新':'已连接';$('#quote-note').textContent='Twelve Data · '+new Date(lastSync).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' 更新';
 $('#settings-status').textContent=fail?'同步完成 '+ok+' 个，'+fail+' 个暂不可用；可检查账户额度或股票代码。':'已更新 '+ok+' 个标的';renderAll();checkLimitOrders()
}
async function loadSeries(symbol,selectedRange){
 if(!apiKey)return;const key=symbol+selectedRange,cached=seriesCache[key];if(cached&&Date.now()-cached.at<300000){drawChart(cached.values);return}
 const opt={'1D':['5min',78],'1W':['30min',80],'1M':['1day',31],'1Y':['1day',252]}[selectedRange]||['5min',78];
 try{const u='https://api.twelvedata.com/time_series?symbol='+encodeURIComponent(symbol)+'&interval='+opt[0]+'&outputsize='+opt[1]+'&order=ASC';const r=await fetch(u,{headers:{Authorization:'apikey '+apiKey},cache:'no-store'});const d=await r.json();if(!r.ok||d.status==='error'||d.code||!Array.isArray(d.values))throw new Error(d.message||'历史 K 线暂不可用');const values=d.values.map(x=>({close:Number(x.close)})).filter(x=>Number.isFinite(x.close));if(values.length<2)throw new Error('没有可用 K 线');seriesCache[key]={values:values,at:Date.now()};drawChart(values)}catch(e){$('#price-chart').innerHTML='<text x="260" y="58" text-anchor="middle" fill="#818a98" font-size="11">'+esc(e.message||'历史 K 线暂不可用')+'</text>'}
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function drawChart(values){
 if(!values||values.length<2){$('#price-chart').innerHTML='<text x="260" y="58" text-anchor="middle" fill="#818a98" font-size="11">连接行情后显示真实 K 线</text>';return}
 const ys=values.map(x=>x.close),mn=Math.min(...ys),mx=Math.max(...ys),span=mx-mn||1,pts=ys.map((v,i)=>[i*520/(ys.length-1),105-(v-mn)/span*90]),path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' '),color=ys[ys.length-1]>=ys[0]?'#26cd8d':'#ff6876';
 $('#price-chart').innerHTML='<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="'+color+'" stop-opacity=".35"/><stop offset="100%" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs><path class="chart-grid" d="M0 23H520 M0 57H520 M0 91H520"/><path class="chart-area" fill="url(#chart-fill)" d="'+path+' L520 112 L0 112 Z"/><path class="chart-line" stroke="'+color+'" d="'+path+'"/><circle cx="520" cy="'+pts[pts.length-1][1]+'" r="3.5" fill="'+color+'"/>'
}
function drawSpark(s){const data=seriesCache[s.symbol+'1D']?.values;if(!data||data.length<2)return '<span class="quote-loading">按需加载</span>';const a=data.slice(-20),mn=Math.min(...a.map(x=>x.close)),mx=Math.max(...a.map(x=>x.close)),path=a.map((x,i)=>(i?'L':'M')+(i*4.6)+' '+(22-(x.close-mn)/(mx-mn||1)*17)).join(' ');return '<svg class="mini-chart '+(a[a.length-1].close>=a[0].close?'up':'down')+'" viewBox="0 0 88 26"><path d="'+path+'"/></svg>'}
function renderIndices(){$('#ticker-strip').innerHTML=indexDefs.map(x=>{const z=q(x.symbol);return '<div class="market-ticker"><b>'+x.label+'</b><span>'+(z?fmt(z.price):'—')+'</span><span class="'+(Number(z?.percent)>=0?'up':'down')+'">'+(z?pct(z.percent):'等待行情')+'</span></div>'}).join('')}
function renderStocks(){
 const search=$('#search-input').value.trim().toLowerCase();let list=stocks.filter(s=>filter==='watch'?state.watchlist.includes(s.symbol):filter==='gainer'?Number(q(s.symbol)?.percent)>0:filter==='loser'?Number(q(s.symbol)?.percent)<0:true).filter(s=>!search||s.symbol.toLowerCase().includes(search)||s.name.toLowerCase().includes(search));
 if(filter==='gainer')list.sort((a,b)=>(q(b.symbol)?.percent||0)-(q(a.symbol)?.percent||0));if(filter==='loser')list.sort((a,b)=>(q(a.symbol)?.percent||0)-(q(b.symbol)?.percent||0));
 $('#stock-table').innerHTML=list.map(s=>{const z=q(s.symbol),v=z?.percent;return '<tr data-symbol="'+s.symbol+'" class="stock-row"><td><div class="stock-cell"><span class="ticker-logo" data-tone="'+s.tone+'">'+(s.symbol==='GOOGL'?'G':s.symbol[0])+'</span><div><div class="stock-name">'+s.name+'</div><div class="stock-symbol">'+s.symbol+' · '+s.exchange+'</div></div></div></td><td class="price-cell">'+fmt(z?.price)+'</td><td><span class="change-chip '+(v>=0?'positive':'negative')+'">'+pct(v)+'</span></td><td class="chart-col">'+drawSpark(s)+'</td><td><div class="row-actions"><button class="row-star '+(state.watchlist.includes(s.symbol)?'saved':'')+'" data-star="'+s.symbol+'" aria-label="'+(state.watchlist.includes(s.symbol)?'取消自选':'加入自选')+'">'+(state.watchlist.includes(s.symbol)?'★':'☆')+'</button><button class="row-trade" data-trade="'+s.symbol+'">交易</button></div></td></tr>'}).join('')||'<tr><td colspan="5" style="text-align:center;color:#7c8491;padding:25px">没有找到匹配的股票</td></tr>';
 $('#stock-count-label').textContent='显示 '+list.length+' 只'+(filter==='watch'?'自选股票':'热门股票');$('#watch-count').textContent=state.watchlist.length;
 $$('.stock-row').forEach(r=>r.addEventListener('click',e=>{if(!e.target.closest('button'))selectStock(r.dataset.symbol,true)}));$$('[data-star]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleWatch(b.dataset.star)}));$$('[data-trade]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();selectStock(b.dataset.trade,true)}))
}
function renderDetail(){
 const s=getStock(selected);if(!s)return;const z=q(s.symbol),move=z?.change,pc=z?.percent;
 $('#detail-logo').textContent=s.symbol[0];$('#detail-name').textContent=s.name;$('#detail-symbol').textContent=s.symbol;$('#detail-price').textContent=fmt(z?.price);
 $('#detail-move').textContent=z?(move>=0?'+':'−')+'$'+Math.abs(move||0).toFixed(2)+' ('+pct(pc)+')':'请连接行情源以查看报价';$('#detail-move').className='detail-move '+(pc>=0?'positive-text':'negative-text');
 $('#detail-open').textContent=fmt(z?.open);$('#detail-high').textContent=fmt(z?.high);$('#detail-low').textContent=fmt(z?.low);$('#detail-volume').textContent=z?.volume?z.volume.toLocaleString('en-US'):'—';
 $('#detail-star').textContent=state.watchlist.includes(s.symbol)?'★':'☆';$('#detail-star').classList.toggle('saved',state.watchlist.includes(s.symbol));$('#detail-star').setAttribute('aria-label',state.watchlist.includes(s.symbol)?'取消自选':'加入自选');
 $('#order-buying-power').textContent=fmt(side==='buy'?availableCash():availableShares(selected)*px(selected));$('#trade-button').textContent=(side==='buy'?'买入':'卖出')+' '+s.symbol+'  →';$('#trade-button').classList.toggle('sell-mode',side==='sell');updatePreview();drawChart(seriesCache[s.symbol+range]?.values);loadSeries(s.symbol,range)
}
function renderHoldings(){
 const entries=Object.entries(state.positions).filter(e=>e[1].qty>1e-6);$('#holdings-table').innerHTML=entries.map(e=>{const sym=e[0],p=e[1],s=getStock(sym)||{name:sym,tone:'blue'},price=px(sym),mv=price*p.qty,profit=(price-p.avgCost)*p.qty;return '<tr><td><div class="stock-cell"><span class="ticker-logo" data-tone="'+s.tone+'">'+sym[0]+'</span><div><div class="stock-name">'+s.name+'</div><div class="stock-symbol">'+sym+'</div></div></div></td><td class="price-cell">'+p.qty.toLocaleString('en-US',{maximumFractionDigits:4})+' 股</td><td class="price-cell">'+fmt(p.avgCost)+'</td><td class="price-cell">'+fmt(q(sym)?.price)+'</td><td class="price-cell">'+fmt(q(sym)?mv:NaN)+'</td><td class="'+(profit>=0?'positive-text':'negative-text')+'" style="font:10px var(--mono)">'+(q(sym)?signed(profit):'—')+'</td></tr>'}).join('');
 $('#empty-holdings').style.display=entries.length?'none':'flex';$('#holdings-table').parentElement.style.display=entries.length?'table':'none'
}
function renderOrders(){
 const rows=state.orders.map(o=>({time:o.time,symbol:o.symbol,side:o.side,type:o.type,qty:o.qty,price:o.limitPrice,status:o.status,id:o.id})).concat(state.trades.filter(t=>t.type!=='limit').slice(0,50).map(t=>({time:t.time,symbol:t.symbol,side:t.side,type:t.type||'market',qty:t.qty,price:t.price,status:'filled'}))).sort((a,b)=>b.time-a.time);
 $('#order-count').textContent=rows.length+' 条记录';$('#empty-orders').style.display=rows.length?'none':'block';
 $('#order-table').innerHTML=rows.slice(0,50).map(r=>'<tr><td class="price-cell">'+new Date(r.time).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+'</td><td class="stock-symbol">'+r.symbol+'</td><td>'+(r.side==='buy'?'买入':'卖出')+'</td><td>'+(r.type==='limit'?'限价单':'市价单')+'</td><td class="price-cell">'+Number(r.qty).toLocaleString('en-US',{maximumFractionDigits:4})+'</td><td class="price-cell">'+fmt(r.status==='filled'?r.fillPrice||r.price:r.price)+'</td><td><span class="order-status '+r.status+'">'+(r.status==='pending'?'等待成交':r.status==='cancelled'?'已撤单':r.status==='rejected'?'已拒绝':'已成交')+'</span></td><td>'+(r.status==='pending'?'<button class="order-cancel" data-cancel="'+r.id+'">撤单</button>':'')+'</td></tr>').join('');
 $$('[data-cancel]').forEach(b=>b.addEventListener('click',()=>cancelOrder(b.dataset.cancel)))
}
function renderAccount(){
 const incomplete=missingPositionQuotes(),invested=marketValue(),total=totalValue(),profit=total-initialCash,p=profit/initialCash*100;
 $('#cash-value').textContent=fmt(availableCash());$('#invested-value').textContent=incomplete?'—':fmt(invested);$('#total-value').textContent=incomplete?'—':fmt(total);$('#profit-value').textContent=incomplete?'—':signed(profit);$('#profit-value').className='stat-value '+(profit<0?'negative-text':'');
 $('#profit-percent').textContent=incomplete?'—':pct(p);$('#profit-percent').className='stat-badge '+(profit>=0?'positive':'negative');$('#total-change').textContent=incomplete?'—':pct(p);$('#total-change').className='stat-badge '+(profit>=0?'positive':'negative');
 $('#order-buying-power').textContent=fmt(side==='buy'?availableCash():availableShares(selected)*px(selected));renderHoldings();renderOrders()
}
function renderStatus(){const z=q(selected);$('#market-badge').textContent=!apiKey?(z?'缓存报价':'行情未连接'):syncing?'同步中':z?(freshQuote(selected)?'已连接':'报价已过期'):'同步中';if(!apiKey)$('#quote-note').textContent='请添加行情 API Key；当前隐藏示例股价';}
function renderAll(){renderIndices();renderStocks();renderDetail();renderAccount();renderStatus()}
function selectStock(s,open=false){selected=s;renderDetail();if(open&&innerWidth<=700)$('#detail-panel').classList.add('mobile-open')}
function toggleWatch(s){state.watchlist=state.watchlist.includes(s)?state.watchlist.filter(x=>x!==s):state.watchlist.concat([s]);save();renderStocks();renderDetail();toast(s+(state.watchlist.includes(s)?' 已加入自选':' 已从自选移除'))}
function updatePreview(){
 const z=q(selected),qty=parseFloat($('#quantity-input').value)||0,limit=parseFloat($('#limit-price').value)||0,isLimit=$('#order-type').value==='limit';$('#limit-row').hidden=!isLimit;
 const reference=isLimit&&limit>0?limit:z?.price,estimated=reference?reference*qty*(side==='buy'?1.0005:.9995):NaN;$('#order-total').textContent=fmt(estimated);
 const enabled=!!z&&qty>0&&(!isLimit||limit>0)&&(isLimit||freshQuote(selected));$('#trade-button').disabled=!enabled;$('#trade-button').style.opacity=enabled?'1':'.45'
}
function fill(order,marketPrice){
 const pos=state.positions[order.symbol]||{qty:0,avgCost:0},price=order.type==='limit'?(order.side==='buy'?Math.min(order.limitPrice,marketPrice):Math.max(order.limitPrice,marketPrice)):marketPrice*(order.side==='buy'?1.0005:.9995);
 if(order.side==='buy'){const cost=order.qty*price;if(cost>availableCash(order.status==='pending'?order.id:null)+1e-8){order.status='rejected';order.note='现金不足';return false}state.positions[order.symbol]={qty:pos.qty+order.qty,avgCost:(pos.qty*pos.avgCost+cost)/(pos.qty+order.qty)};state.cash-=cost}
 else{if(order.qty>availableShares(order.symbol,order.status==='pending'?order.id:null)+1e-8){order.status='rejected';order.note='持仓不足';return false}pos.qty-=order.qty;state.cash+=order.qty*price;if(pos.qty<1e-6)delete state.positions[order.symbol];else state.positions[order.symbol]=pos}
 order.status='filled';order.fillPrice=price;state.trades.unshift({symbol:order.symbol,qty:order.qty,side:order.side,type:order.type,price:price,time:Date.now()});return true
}
function checkLimitOrders(){let changed=false;state.orders.filter(o=>o.status==='pending').forEach(o=>{const p=px(o.symbol);if(p&&freshQuote(o.symbol)&&(o.side==='buy'&&p<=o.limitPrice||o.side==='sell'&&p>=o.limitPrice)){fill(o,p);changed=true}});if(changed){save();renderAll()}}
function trade(){
 const z=q(selected),qty=parseFloat($('#quantity-input').value),type=$('#order-type').value,limit=parseFloat($('#limit-price').value);if(!z){toast('请先连接真实行情');return}if(type==='market'&&!freshQuote(selected)){toast('报价已过期，请先刷新行情');return}if(!Number.isFinite(qty)||qty<=0){toast('请输入有效数量');return}if(type==='limit'&&(!Number.isFinite(limit)||limit<=0)){toast('请输入有效限价');return}
 const o={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),symbol:selected,qty:qty,side:side,type:type,limitPrice:type==='limit'?limit:null,status:type==='limit'?'pending':'new',time:Date.now()};
 if(type==='market'){if(!fill(o,z.price)){toast(o.note==='现金不足'?'可用现金不足':'可卖持仓不足');return}toast('市价模拟成交 '+qty+' 股 '+selected+' @ '+fmt(o.fillPrice))}
 else{if(side==='buy'&&qty*limit>availableCash()){toast('限价单金额超过可用现金');return}if(side==='sell'&&qty>availableShares(selected)){toast('限价单数量超过可卖持仓');return}state.orders.unshift(o);if(freshQuote(selected)&&(side==='buy'&&z.price<=limit||side==='sell'&&z.price>=limit)){if(!fill(o,z.price))toast(o.note);else toast('限价单立即成交 @ '+fmt(o.fillPrice))}else toast('限价单已提交，等待最新报价触发')}
 save();renderAll()
}
function cancelOrder(id){const o=state.orders.find(x=>x.id===id);if(o&&o.status==='pending'){o.status='cancelled';save();renderAll();toast('订单已撤销')}}
function openSettings(){$('#api-key-input').value=apiKey;$('#settings-backdrop').hidden=false;$('#settings-status').textContent=apiKey?'密钥仅保存在当前会话。':'';$('#api-key-input').focus()}
function closeSettings(){$('#settings-backdrop').hidden=true}
async function connectMarket(){const k=$('#api-key-input').value.trim();if(!k){$('#settings-status').textContent='请先输入 API Key';return}apiKey=k;sessionStorage.setItem('papertrade-market-key',k);$('#settings-status').textContent='正在验证 API Key…';try{await fetchQuote('AAPL');renderAll();$('#settings-status').textContent='密钥有效，开始同步行情…';await syncQuotes()}catch(e){$('#settings-status').textContent='行情连接失败：'+(e.message||'请检查密钥和服务额度');$('#market-badge').textContent='连接失败'}}
function marketClock(){const now=new Date(),fmtTime=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);$('#market-clock').textContent=fmtTime;const day=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(now),hhmm=fmtTime.split(':').map(Number),m=hhmm[0]*60+hhmm[1],open=day!=='Sat'&&day!=='Sun'&&m>=570&&m<960;$('#today-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'America/New_York',month:'long',day:'numeric',weekday:'short'}).format(now)+' · '+(open?'预计常规交易时段':'休市/盘前盘后')}
$$('.side-link,.mobile-nav button[data-view],.text-button[data-view]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.view;$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#breadcrumb-view').textContent=v==='market'?'市场行情':v==='portfolio'?'我的持仓':'自选列表';if(v==='portfolio')$('.holdings-panel').scrollIntoView({behavior:'smooth',block:'center'});else if(v==='watchlist'){filter='watch';$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter==='watch'));renderStocks();$('.stocks-panel').scrollIntoView({behavior:'smooth',block:'start'})}else if(v==='market'){filter='all';$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter==='all'));renderStocks();window.scrollTo({top:0,behavior:'smooth'})}}));
$$('.tab').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('.tab').forEach(t=>t.classList.toggle('active',t===b));renderStocks()}));
$('#search-input').addEventListener('input',renderStocks);$('#view-all').addEventListener('click',()=>{$('#search-input').value='';filter='all';$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter==='all'));renderStocks()});
$('#detail-star').addEventListener('click',()=>toggleWatch(selected));$$('.trade-switch button').forEach(b=>b.addEventListener('click',()=>{side=b.dataset.side;$$('.trade-switch button').forEach(x=>x.classList.toggle('active',x===b));renderDetail()}));
$('#quantity-input').addEventListener('input',updatePreview);$('#limit-price').addEventListener('input',updatePreview);$('#order-type').addEventListener('change',updatePreview);
$('#qty-minus').addEventListener('click',()=>{const x=$('#quantity-input');x.value=Math.max(.01,(parseFloat(x.value)||1)-1);updatePreview()});$('#qty-plus').addEventListener('click',()=>{const x=$('#quantity-input');x.value=(parseFloat(x.value)||0)+1;updatePreview()});
$('#trade-button').addEventListener('click',trade);$('#close-detail').addEventListener('click',()=>$('#detail-panel').classList.remove('mobile-open'));$('#detail-panel').addEventListener('click',e=>{if(e.target===e.currentTarget)$('#detail-panel').classList.remove('mobile-open')});
$$('.range-select button').forEach(b=>b.addEventListener('click',()=>{range=b.dataset.range;$$('.range-select button').forEach(x=>x.classList.toggle('active',x===b));loadSeries(selected,range)}));
$('#market-settings').addEventListener('click',openSettings);$('#settings-close').addEventListener('click',closeSettings);$('#settings-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeSettings()});$('#connect-market').addEventListener('click',connectMarket);
$('#clear-key').addEventListener('click',()=>{apiKey='';sessionStorage.removeItem('papertrade-market-key');quotes={};localStorage.removeItem('papertrade-quotes');seriesCache={};$('#settings-status').textContent='密钥和本次会话报价已清除';renderAll()});
$('#reset-button').addEventListener('click',()=>{if(confirm('确定重置模拟账户吗？这会清除现金、持仓、订单及交易记录。')){state={cash:initialCash,positions:{},watchlist:['NVDA','AAPL'],trades:[],orders:[]};save();renderAll();toast('模拟账户已重置')}});
$('#mobile-account').addEventListener('click',()=>toast('总资产 '+fmt(totalValue())+' · 可用现金 '+fmt(availableCash())));
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search-input').focus()}if(e.key==='Escape'){closeSettings();$('#detail-panel').classList.remove('mobile-open')}});
renderAll();marketClock();setInterval(marketClock,1000);if(apiKey){syncQuotes();setInterval(syncQuotes,15*60*1000)}
