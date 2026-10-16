window.addEventListener('unhandledrejection',e=>{
  console.error('Onverwerkte fout:',e.reason);
});

import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  collection, doc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, where
} from './firebase-app.js';

const ADMIN_EMAILS = new Set(['mh.makrostore@gmail.com','sales@maxi.com']);
const TABLET_EMAIL = 'maxitrucktablet@maxitruck.local';

let currentUser = null;
let currentRole = null;
let products = [];
let customers = [];
let sales = [];
let cart = [];
let currentProductPhoto = '';
let currentInvoiceId = makeId('inv');
let pendingPriceChanges = [];
let restockHistory = [];

const money = n => 'CG ' + Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function makeId(prefix='id'){
  if(window.crypto && crypto.randomUUID) return prefix + '_' + crypto.randomUUID();
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
}
async function compressPhoto(file){
  if(!file) return '';
  const dataUrl=await new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
  });
  const img=await new Promise((resolve,reject)=>{
    const im=new Image(); im.onload=()=>resolve(im); im.onerror=reject; im.src=dataUrl;
  });
  const max=640; let w=img.width,h=img.height;
  if(w>h && w>max){h=Math.round(h*max/w);w=max;}
  else if(h>=w && h>max){w=Math.round(w*max/h);h=max;}
  const c=document.createElement('canvas'); c.width=w;c.height=h;
  c.getContext('2d').drawImage(img,0,0,w,h);
  return c.toDataURL('image/jpeg',0.72);
}
function setPhotoPreview(data){
  currentProductPhoto=data||'';
  const wrap=document.getElementById('photoPreviewWrap'), img=document.getElementById('photoPreview');
  if(currentProductPhoto){img.src=currentProductPhoto;wrap.classList.remove('hidden');}
  else{img.removeAttribute('src');wrap.classList.add('hidden');}
}

function commissionForLine(line){
  const pct=Number(line.commission||0)/100;
  if(pct<=0) return 0;
  const qty=Number(line.qty||0);

  // Alleen voor producten die éénmalig als TP zijn aangevinkt.
  if(line.tpCommission){
    if(line.unit==='P12'){
      return Number(line.tpP12CommissionBase||0) * qty * pct;
    }
    if(line.unit==='CRT'){
      return Number(line.tpCrtCommissionBase||0) * qty * pct;
    }
  }

  // Normale verkoop / EACH / andere eenheden.
  return Number(line.commissionBase||0) * qty * pct;
}

function calcLine(line){
  const subtotal=Number(line.price||0)*Number(line.qty||0);
  const obAmount=subtotal*(Number(line.ob||0)/100);
  return {subtotal,obAmount,total:subtotal+obAmount};
}

function seenPriceChangeIds(){
  try{return JSON.parse(localStorage.getItem('maxiTruck_seenPriceChanges_v1')||'[]');}
  catch(e){return [];}
}
function markPriceChangesSeen(ids){
  const seen=new Set(seenPriceChangeIds());
  ids.forEach(id=>seen.add(id));
  localStorage.setItem('maxiTruck_seenPriceChanges_v1',JSON.stringify([...seen].slice(-500)));
}
async function showPendingPriceChanges(){
  if(currentRole!=='sales') return;
  try{
    const snap=await getDocs(collection(db,'priceChanges'));
    const seen=new Set(seenPriceChangeIds());
    pendingPriceChanges=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(x=>!seen.has(x.id))
      .sort((a,b)=>String(a.changedAt||'').localeCompare(String(b.changedAt||'')));
    if(!pendingPriceChanges.length)return;

    document.getElementById('priceChangeContent').innerHTML=pendingPriceChanges.map(x=>`
      <div class="price-change-item">
        <div class="price-change-name">${esc(x.productName||'Product')}</div>
        ${x.eachChanged?`<div class="price-change-price">Nieuwe EACH prijs: ${money(x.newEachPrice)}</div>`:''}
        ${x.p12Changed?`<div class="price-change-price">Nieuwe P12 prijs: ${money(x.newP12Price)}</div>`:''}
        ${x.crtChanged?`<div class="price-change-price">Nieuwe CRT prijs: ${money(x.newCrtPrice)}</div>`:''}
      </div>
    `).join('');
    document.getElementById('priceChangeModal').classList.remove('hidden');
  }catch(e){}
}
document.getElementById('priceChangeContinueBtn').onclick=()=>{
  if(pendingPriceChanges.length) markPriceChangesSeen(pendingPriceChanges.map(x=>x.id));
  pendingPriceChanges=[];
  document.getElementById('priceChangeModal').classList.add('hidden');
  openView('sale');
};



function showToast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),2200);
}
function updateNetworkBadge(){
  const el=document.getElementById('networkBadge'); if(!el)return;
  if(navigator.onLine){el.textContent='Online';el.classList.remove('offline');el.classList.add('online');}
  else{el.textContent='Offline';el.classList.remove('online');el.classList.add('offline');}
}
window.addEventListener('online',()=>{updateNetworkBadge();showToast('Internet terug. Synchronisatie loopt automatisch.');});
window.addEventListener('offline',()=>{updateNetworkBadge();showToast('Offline modus actief.');});
updateNetworkBadge();


function showApp(user){
  currentUser=user;
  const userEmail=String(user.email||'').toLowerCase();
  currentRole = ADMIN_EMAILS.has(userEmail) ? 'admin' : (userEmail === TABLET_EMAIL ? 'sales' : null);

  if(!currentRole){
    document.getElementById('authStatus').textContent='Dit account heeft geen toegang tot Maxi-Truck.';
    signOut(auth);
    return;
  }

  document.getElementById('authGate').classList.add('hidden');
  document.getElementById('appHeader').classList.remove('hidden');
  document.getElementById('appTabs').classList.remove('hidden');
  document.getElementById('appMain').classList.remove('hidden');
  document.getElementById('userBadge').textContent = user.email + ' • ' + (currentRole==='admin'?'Beheerder':'Verkoop');

  applyRoleUI();
  loadAll();
}

function hideApp(){
  document.getElementById('authGate').classList.remove('hidden');
  document.getElementById('appHeader').classList.add('hidden');
  document.getElementById('appTabs').classList.add('hidden');
  document.getElementById('appMain').classList.add('hidden');
}

function applyRoleUI(){
  const tabs=[...document.querySelectorAll('.tabs button')];
  if(currentRole==='sales'){
    tabs.forEach(btn=>{
      if(!['sale','history'].includes(btn.dataset.view)) btn.classList.add('hidden');
      else btn.classList.remove('hidden');
    });
    openView('sale');
  } else {
    tabs.forEach(btn=>btn.classList.remove('hidden'));
    openView('products');
  }
}

function openView(view){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const el=document.getElementById('view-'+view);
  if(el) el.classList.add('active');
  if(view==='products') renderNegativeStockAlert();
}

document.querySelectorAll('.tabs button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    openView(btn.dataset.view);
    if(btn.dataset.view==='restock') renderRestock();
  });
});

async function doEmailLogin(){
  const status=document.getElementById('authStatus');
  status.textContent='Bezig met inloggen...';
  try{
    await signInWithEmailAndPassword(
      auth,
      document.getElementById('loginEmail').value.trim(),
      document.getElementById('loginPassword').value
    );
  }catch(e){
    status.textContent='Inloggen mislukt: '+(e.code||e.message||'onbekende fout');
    console.error('Email login fout:',e);
  }
}
document.getElementById('emailLoginBox').addEventListener('submit',async(e)=>{
  e.preventDefault();
  await doEmailLogin();
});
document.getElementById('googleLoginBtn').onclick=async()=>{
  try{ await signInWithPopup(auth, googleProvider); }
  catch(e){document.getElementById('authStatus').textContent='Google-login mislukt: '+e.message;}
};
document.getElementById('logoutBtn').onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>user?showApp(user):hideApp());

async function loadAll(){
  await Promise.all([loadProducts(),loadCustomers(),loadSales(),loadRestockHistory()]);
  rememberAutoSyncState();
  renderAll();
  await showPendingPriceChanges();
}

async function loadProducts(){
  const snap=await getDocs(collection(db,'products'));
  products=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadCustomers(){
  const snap=await getDocs(collection(db,'customers'));
  customers=snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function loadSales(){
  const snap=await getDocs(collection(db,'sales'));
  sales=snap.docs.map(d=>({id:d.id,...d.data()}));
}

async function loadRestockHistory(){
  try{
    const snap=await getDocs(collection(db,'restocks'));
    restockHistory=snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }catch(e){
    console.warn('Voorraad-aanvulhistorie kon niet worden geladen:',e);
    restockHistory=[];
  }
}


let autoSyncBusy=false;
let autoSyncProductSig='';
let autoSyncCustomerSig='';
let autoSyncSalesSig='';

function dataSignature(arr, fields){
  return arr
    .map(x=>fields.map(f=>JSON.stringify(x?.[f]??null)).join('|'))
    .sort()
    .join('||');
}

function currentProductSignature(){
  return dataSignature(products,[
    'id','code','name','category','price','p12Price','qtyPrice1Qty','qtyPrice1Price',
    'qtyPrice2Qty','qtyPrice2Price','crtPrice','crtPcs','crtFree','stock',
    'commission','commissionBase','tpP12CommissionBase','tpCrtCommissionBase',
    'tpCommission','ob','photo'
  ]);
}

function currentCustomerSignature(){
  return dataSignature(customers,['id','name']);
}

function currentSalesSignature(){
  return dataSignature(sales,['id','invoiceNumber','date','createdAt','customer','total']);
}

function rememberAutoSyncState(){
  autoSyncProductSig=currentProductSignature();
  autoSyncCustomerSig=currentCustomerSignature();
  autoSyncSalesSig=currentSalesSignature();
}

async function autoSyncFromFirestore(){
  if(!currentUser || autoSyncBusy || !navigator.onLine) return;
  autoSyncBusy=true;

  try{
    const [productSnap,customerSnap,salesSnap]=await Promise.all([
      getDocs(collection(db,'products')),
      getDocs(collection(db,'customers')),
      getDocs(collection(db,'sales'))
    ]);

    const newProducts=productSnap.docs.map(d=>({id:d.id,...d.data()}));
    const newCustomers=customerSnap.docs.map(d=>({id:d.id,...d.data()}));
    const newSales=salesSnap.docs.map(d=>({id:d.id,...d.data()}));

    const productSig=dataSignature(newProducts,[
      'id','code','name','category','price','p12Price','qtyPrice1Qty','qtyPrice1Price',
      'qtyPrice2Qty','qtyPrice2Price','crtPrice','crtPcs','crtFree','stock',
      'commission','commissionBase','tpP12CommissionBase','tpCrtCommissionBase',
      'tpCommission','ob','photo'
    ]);
    const customerSig=dataSignature(newCustomers,['id','name']);
    const salesSig=dataSignature(newSales,['id','invoiceNumber','date','createdAt','customer','total']);

    const productsChanged=productSig!==autoSyncProductSig;
    const customersChanged=customerSig!==autoSyncCustomerSig;
    const salesChanged=salesSig!==autoSyncSalesSig;

    if(productsChanged){
      products=newProducts;
      autoSyncProductSig=productSig;
      renderProducts();
      renderProductSearch();
      renderRestock();
    }

    if(customersChanged){
      customers=newCustomers;
      autoSyncCustomerSig=customerSig;
      renderCustomers();
      renderCustomersDatalist();
    }

    if(salesChanged){
      sales=newSales;
      autoSyncSalesSig=salesSig;
      renderHistory();
      renderClosing();
    }

    if(productsChanged || customersChanged || salesChanged){
      showToast('Wijzigingen automatisch bijgewerkt.');
    }
  }catch(e){
    console.warn('Automatisch synchroniseren mislukt:',e);
  }finally{
    autoSyncBusy=false;
  }
}

// Controleert automatisch op wijzigingen van de beheerder.
// Geen handmatige refresh meer nodig op de verkoop/tablet.
setInterval(autoSyncFromFirestore,5000);
window.addEventListener('focus',autoSyncFromFirestore);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden) autoSyncFromFirestore();
});

function renderAll(){
  renderProducts(); renderProductSearch(); renderCustomers(); renderCustomersDatalist(); renderHistory(); renderClosing(); renderCart(); renderRestock(); renderRestockHistory(); renderNegativeStockAlert();
}


function renderNegativeStockAlert(){
  const panel=document.getElementById('negativeStockAlert');
  if(!panel) return;
  if(currentRole!=='admin'){panel.classList.add('hidden');return;}
  const negative=products.filter(p=>Number(p.stock||0)<0).sort((a,b)=>Number(a.stock)-Number(b.stock));
  panel.classList.toggle('hidden',negative.length===0);
  panel.innerHTML=negative.length ? `<h2>⚠ Voorraad controleren — ${negative.length} product(en) in de min</h2><p>Deze producten zijn verkocht terwijl de geregistreerde voorraad onvoldoende was. Controleer en corrigeer de voorraad.</p><div class="table-wrap"><table><thead><tr><th>Code</th><th>Product</th><th>Voorraad</th></tr></thead><tbody>${negative.map(p=>`<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td><strong style="color:#b91c1c">${Number(p.stock)}</strong></td></tr>`).join('')}</tbody></table></div>` : '';
}
function renderRestock(){
  renderNegativeStockAlert();
  const body=document.getElementById('restockBody');
  if(!body) return;
  const q=(document.getElementById('restockFilter')?.value||'').toLowerCase().trim();
  let arr=products.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(q) arr=arr.filter(p=>String(p.code).toLowerCase().includes(q)||p.name.toLowerCase().includes(q));

  body.innerHTML=arr.length?arr.map(p=>`
    <tr>
      <td><strong>${esc(p.code)}</strong></td>
      <td>${esc(p.name)}</td>
      <td>${Number(p.stock||0)}</td>
      <td><input class="restock-input" type="number" min="0" step="1" placeholder="0" data-restock="${p.id}"></td>
      <td class="restock-new" data-new-stock="${p.id}">${Number(p.stock||0)}</td>
    </tr>
  `).join(''):'<tr><td colspan="5" class="muted">Geen producten gevonden.</td></tr>';

  body.querySelectorAll('[data-restock]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const p=products.find(x=>x.id===inp.dataset.restock);
      const add=Math.max(0,Number(inp.value||0));
      const target=body.querySelector(`[data-new-stock="${inp.dataset.restock}"]`);
      if(target&&p) target.textContent=Number(p.stock||0)+add;
    });
  });
}


function renderRestockHistory(){
  const el=document.getElementById('restockHistory');
  if(!el) return;

  const arr=restockHistory.slice(0,20);

  if(!arr.length){
    el.innerHTML='<div class="muted">Nog geen opgeslagen aanvullingen.</div>';
    return;
  }

  el.innerHTML=arr.map(entry=>{
    const d=entry.createdAt?new Date(entry.createdAt):null;
    const dateText=d && !Number.isNaN(d.getTime())
      ? `${d.toLocaleDateString('nl-NL')} ${d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}`
      : '';

    return `
      <div class="sale-card">
        <div class="sale-head">
          <span><strong>Voorraad bijgevoegd</strong></span>
          <span>${dateText}</span>
        </div>
        <div class="sale-lines">
          ${(entry.lines||[]).map(l=>`
            <div style="display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:12px;padding:5px 0">
              <span><strong>${esc(l.code||'')}</strong> — ${esc(l.name||'')}</span>
              <span><strong>+${Number(l.added||0)}</strong> &nbsp; ${Number(l.oldStock||0)} → ${Number(l.newStock||0)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('restockFilter')?.addEventListener('input',renderRestock);

document.getElementById('clearRestockBtn')?.addEventListener('click',()=>{
  document.querySelectorAll('[data-restock]').forEach(inp=>inp.value='');
  renderRestock();
});

document.getElementById('printRestockBtn')?.addEventListener('click',()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan de voorraadlijst printen.');return;}

  const q=(document.getElementById('restockFilter')?.value||'').toLowerCase().trim();
  let arr=products.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(q) arr=arr.filter(p=>String(p.code).toLowerCase().includes(q)||p.name.toLowerCase().includes(q));

  const rows=arr.map(p=>{
    const inp=document.querySelector(`[data-restock="${p.id}"]`);
    const add=inp && inp.value!=='' ? Number(inp.value||0) : 0;
    const newStock=Number(p.stock||0)+add;
    return `<tr>
      <td>${esc(p.code)}</td>
      <td>${esc(p.name)}</td>
      <td>${Number(p.stock||0)}</td>
      <td>${add>0?add:''}</td>
      <td>${newStock}</td>
    </tr>`;
  }).join('');

  const now=new Date();
  printHtml(`
    <h1>Maxi-Truck — Voorraad aanvullen</h1>
    <p><strong>Datum:</strong> ${now.toLocaleDateString('nl-NL')} &nbsp; <strong>Tijd:</strong> ${now.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}</p>
    <table>
      <tr><th>Code</th><th>Product</th><th>Huidige voorraad</th><th>Bijvullen</th><th>Nieuwe voorraad</th></tr>
      ${rows}
    </table>
  `);
});

document.getElementById('saveRestockBtn')?.addEventListener('click',async()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan voorraad aanvullen.');return;}

  const inputs=[...document.querySelectorAll('[data-restock]')];
  const changes=inputs
    .map(inp=>({id:inp.dataset.restock,add:Number(inp.value||0)}))
    .filter(x=>Number.isFinite(x.add)&&x.add>0);

  if(changes.length===0){showToast('Vul minimaal één aantal in.');return;}

  try{
    const savedLines=[];

    for(const ch of changes){
      const p=products.find(x=>x.id===ch.id);
      if(!p) continue;

      const oldStock=Number(p.stock||0);
      const newStock=oldStock+ch.add;

      p.stock=newStock;
      await updateDoc(doc(db,'products',p.id),{stock:newStock});

      savedLines.push({
        productId:p.id,
        code:p.code||'',
        name:p.name||'',
        oldStock,
        added:ch.add,
        newStock
      });
    }

    if(savedLines.length){
      const historyDoc={
        createdAt:new Date().toISOString(),
        createdBy:currentUser?.email||'',
        lines:savedLines
      };

      const ref=await addDoc(collection(db,'restocks'),historyDoc);
      restockHistory.unshift({id:ref.id,...historyDoc});
      restockHistory=restockHistory.slice(0,50);
    }

    autoSyncProductSig=currentProductSignature();
    renderAll();
    document.querySelectorAll('[data-restock]').forEach(inp=>inp.value='');
    showToast(savedLines.length+' voorraadregels opgeslagen en toegevoegd aan historie.');
  }catch(e){
    showToast('Voorraad kon niet volledig worden opgeslagen: '+e.message);
  }
});

function renderCustomersDatalist(){
  document.getElementById('customerList').innerHTML=customers
    .slice().sort((a,b)=>a.name.localeCompare(b.name))
    .map(c=>`<option value="${esc(c.name)}"></option>`).join('');
}

document.getElementById('addCustomerBtn').onclick=async()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan klanten beheren.');return;}
  const name=document.getElementById('newCustomer').value.trim();
  if(!name) return;
  if(customers.some(c=>c.name.toLowerCase()===name.toLowerCase())){showToast('Deze klant bestaat al.');return;}
  const ref=await addDoc(collection(db,'customers'),{name});
  customers.push({id:ref.id,name}); autoSyncCustomerSig=currentCustomerSignature(); document.getElementById('newCustomer').value=''; renderCustomers(); renderCustomersDatalist();
};

function renderCustomers(){
  const el=document.getElementById('customersList');
  if(!el) return;

  const q=(document.getElementById('customerSearch')?.value||'').toLowerCase().trim();
  let arr=customers.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(q) arr=arr.filter(c=>c.name.toLowerCase().startsWith(q));

  el.innerHTML=arr.length?arr.map(c=>`
    <div class="customer-row">
      <strong>${esc(c.name)}</strong>
      ${currentRole==='admin'?`
        <button class="icon-btn" data-customer-history="${c.id}">Overzicht</button>
        <button class="danger icon-btn" data-del-customer="${c.id}">Verwijderen</button>
      `:''}
    </div>
  `).join(''):'<div class="muted">Geen klanten gevonden.</div>';

  el.querySelectorAll('[data-customer-history]').forEach(b=>{
    b.onclick=()=>{
      const c=customers.find(x=>x.id===b.dataset.customerHistory);
      if(c) showCustomerPurchaseOverview(c.name);
    };
  });

  el.querySelectorAll('[data-del-customer]').forEach(b=>b.onclick=async()=>{
    await deleteDoc(doc(db,'customers',b.dataset.delCustomer));
    customers=customers.filter(c=>c.id!==b.dataset.delCustomer);
    autoSyncCustomerSig=currentCustomerSignature();
    renderCustomers();
    renderCustomersDatalist();
  });
}

const customerSearch=document.getElementById('customerSearch');
if(customerSearch){
  customerSearch.addEventListener('input',renderCustomers);
}

function customerPurchaseData(customerName){
  const key=String(customerName||'').trim().toLowerCase();
  const customerSales=sales.filter(
    s=>String(s.customer||'').trim().toLowerCase()===key
  );
  const grouped={};

  customerSales.forEach(s=>{
    (s.lines||[]).forEach(l=>{
      const unit=l.label||l.unit||'EACH';
      const groupKey=(l.productId||l.code||l.name||'')+'_'+unit;
      if(!grouped[groupKey]){
        grouped[groupKey]={
          code:l.code||'',
          name:l.name||'',
          unit,
          qty:0,
          total:0,
          lastDate:s.createdAt||s.date||''
        };
      }
      grouped[groupKey].qty+=Number(l.qty||0);
      grouped[groupKey].total+=Number(
        l.total ?? ((l.subtotal ?? (Number(l.price||0)*Number(l.qty||0))) + Number(l.obAmount||0))
      );
      const d=s.createdAt||s.date||'';
      if(String(d)>String(grouped[groupKey].lastDate||'')) grouped[groupKey].lastDate=d;
    });
  });

  return {
    sales:customerSales,
    products:Object.values(grouped).sort((a,b)=>
      a.name.localeCompare(b.name) || String(a.unit).localeCompare(String(b.unit))
    ),
    total:customerSales.reduce((sum,s)=>sum+Number(s.total||0),0)
  };
}

function showCustomerPurchaseOverview(customerName){
  if(currentRole!=='admin') return;
  const data=customerPurchaseData(customerName);

  document.getElementById('customerPurchaseOverlay')?.remove();

  const overlay=document.createElement('div');
  overlay.id='customerPurchaseOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;padding:20px;overflow:auto';

  overlay.innerHTML=`
    <div style="background:#fff;max-width:1000px;margin:20px auto;padding:24px;border-radius:16px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">Aankoopoverzicht — ${esc(customerName)}</h2>
        <button id="closeCustomerPurchase" class="danger icon-btn">Sluiten</button>
      </div>

      ${data.sales.length?`
        <p><strong>Aantal bestellingen:</strong> ${data.sales.length}</p>
        <div style="overflow:auto">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th>Eenheid</th>
                <th>Totaal gekocht</th>
                <th>Laatste aankoop</th>
                <th>Bedrag</th>
              </tr>
            </thead>
            <tbody>
              ${data.products.map(p=>`
                <tr>
                  <td>${esc(p.code)}</td>
                  <td>${esc(p.name)}</td>
                  <td>${esc(p.unit)}</td>
                  <td>${p.qty}</td>
                  <td>${p.lastDate?new Date(p.lastDate).toLocaleDateString('nl-NL'):'-'}</td>
                  <td>${money(p.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <h3 style="text-align:right">Totaal besteed: ${money(data.total)}</h3>
        <button id="printCustomerPurchase" class="secondary">Print klantoverzicht</button>
      `:`<p class="muted">Geen oude bestellingen gevonden voor deze klant.</p>`}
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById('closeCustomerPurchase').onclick=()=>overlay.remove();

  const printBtn=document.getElementById('printCustomerPurchase');
  if(printBtn) printBtn.onclick=()=>printCustomerPurchaseOverview(customerName);
}

function printCustomerPurchaseOverview(customerName){
  const data=customerPurchaseData(customerName);
  printHtml(`
    <h1>Maxi-Truck — Klant aankoopoverzicht</h1>
    <p><strong>Klant:</strong> ${esc(customerName)}</p>
    <p><strong>Datum rapport:</strong> ${new Date().toLocaleDateString('nl-NL')}</p>
    <p><strong>Aantal bestellingen:</strong> ${data.sales.length}</p>
    <table>
      <tr>
        <th>Code</th><th>Product</th><th>Eenheid</th>
        <th>Totaal gekocht</th><th>Laatste aankoop</th><th>Bedrag</th>
      </tr>
      ${data.products.map(p=>`
        <tr>
          <td>${esc(p.code)}</td>
          <td>${esc(p.name)}</td>
          <td>${esc(p.unit)}</td>
          <td>${p.qty}</td>
          <td>${p.lastDate?new Date(p.lastDate).toLocaleDateString('nl-NL'):'-'}</td>
          <td>${money(p.total)}</td>
        </tr>
      `).join('')}
    </table>
    <h2 style="text-align:right">Totaal besteed: ${money(data.total)}</h2>
  `);
}


function fillProductForm(p){
  if(!p) return;
  document.getElementById('productId').value=p.id;
  document.getElementById('pCode').value=p.code||'';
  document.getElementById('pName').value=p.name||'';
  document.getElementById('pCategory').value=p.category||'CANDY';
  document.getElementById('pPrice').value=p.price ?? '';
  document.getElementById('pP12Price').value=p.p12Price ?? '';
  document.getElementById('pQtyPrice1Qty').value=p.qtyPrice1Qty ?? '';
  document.getElementById('pQtyPrice1Price').value=p.qtyPrice1Price ?? '';
  document.getElementById('pQtyPrice2Qty').value=p.qtyPrice2Qty ?? '';
  document.getElementById('pQtyPrice2Price').value=p.qtyPrice2Price ?? '';
  document.getElementById('pCrtPrice').value=p.crtPrice ?? '';
  document.getElementById('pCrtPcs').value=p.crtPcs ?? '';
  document.getElementById('pCrtFree').checked=!!p.crtFree;
  document.getElementById('pStock').value=p.stock ?? 0;
  document.getElementById('pCommission').value=p.commission ?? 0;
  document.getElementById('pCommissionBase').value=p.commissionBase ?? '';
  document.getElementById('pTpP12CommissionBase').value=p.tpP12CommissionBase ?? '';
  document.getElementById('pTpCrtCommissionBase').value=p.tpCrtCommissionBase ?? '';
  document.getElementById('pTpCommission').checked=!!p.tpCommission;
  document.getElementById('pOb').value=p.ob ?? 0;
  setPhotoPreview(p.photo||'');
}


function findProductByCode(code){
  const c=String(code||'').trim().toLowerCase();
  if(!c) return null;
  return products.find(p=>String(p.code||'').trim().toLowerCase()===c) || null;
}

async function lookupProductByCode(code,{showMessage=true}={}){
  const status=document.getElementById('codeLookupStatus');
  const clean=String(code||'').trim();
  if(!clean){
    if(status) status.textContent='';
    return null;
  }

  if(status) status.textContent='Code zoeken...';

  // First try already loaded products
  let existing=findProductByCode(clean);
  if(existing){
    fillProductForm(existing);
    if(status) status.textContent='Bestaand product geladen.';
    if(showMessage) showToast('Bestaande code gevonden. Gegevens zijn geladen.');
    return existing;
  }

  // Then query Firestore directly, so it also works if the local list is stale
  try{
    const exactSnap=await getDocs(query(collection(db,'products'),where('code','==',clean)));
    if(!exactSnap.empty){
      const d=exactSnap.docs[0];
      existing={id:d.id,...d.data()};
      if(!products.some(p=>p.id===existing.id)) products.push(existing);
      fillProductForm(existing);
      if(status) status.textContent='Bestaand product geladen.';
      if(showMessage) showToast('Bestaande code gevonden. Gegevens zijn geladen.');
      return existing;
    }

    // Fallback for codes that may have been stored as numbers
    if(/^\d+$/.test(clean)){
      const numeric=Number(clean);
      const numSnap=await getDocs(query(collection(db,'products'),where('code','==',numeric)));
      if(!numSnap.empty){
        const d=numSnap.docs[0];
        existing={id:d.id,...d.data()};
        if(!products.some(p=>p.id===existing.id)) products.push(existing);
        fillProductForm(existing);
        if(status) status.textContent='Bestaand product geladen.';
        if(showMessage) showToast('Bestaande code gevonden. Gegevens zijn geladen.');
        return existing;
      }
    }
  }catch(e){
    console.error('Code zoeken mislukt:',e);
    if(status) status.textContent='Code zoeken kon niet worden voltooid.';
    return null;
  }

  if(status) status.textContent='Nieuwe productcode.';
  return null;
}

let codeLookupTimer=null;
document.getElementById('pCode').addEventListener('input',()=>{
  clearTimeout(codeLookupTimer);
  const code=document.getElementById('pCode').value.trim();
  const status=document.getElementById('codeLookupStatus');
  if(!code){
    if(status) status.textContent='';
    return;
  }
  codeLookupTimer=setTimeout(()=>lookupProductByCode(code,{showMessage:false}),500);
});

document.getElementById('pCode').addEventListener('change',()=>{
  lookupProductByCode(document.getElementById('pCode').value,{showMessage:true});
});

document.getElementById('pCode').addEventListener('blur',()=>{
  lookupProductByCode(document.getElementById('pCode').value,{showMessage:false});
});

function resetProductForm(){
  ['productId','pCode','pName','pPrice','pP12Price','pQtyPrice1Qty','pQtyPrice1Price','pQtyPrice2Qty','pQtyPrice2Price','pCrtPrice','pCrtPcs','pStock','pCommission','pOb'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pPhoto').value='';
  document.getElementById('pCategory').value='CANDY';
  document.getElementById('pCrtFree').checked=false;
  setPhotoPreview('');
  document.getElementById('pCommissionBase').value='';
  document.getElementById('pTpP12CommissionBase').value='';
  document.getElementById('pTpCrtCommissionBase').value='';
  document.getElementById('pTpCommission').checked=false;
}
document.getElementById('pPhoto').addEventListener('change',async e=>{
  const file=e.target.files && e.target.files[0]; if(!file)return;
  try{setPhotoPreview(await compressPhoto(file));}catch(e){showToast('Foto kon niet worden gelezen.');}
});
document.getElementById('removePhotoBtn').onclick=()=>{document.getElementById('pPhoto').value='';setPhotoPreview('');};

document.getElementById('saveProductBtn').onclick=async()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan producten wijzigen.');return;}
  let id=document.getElementById('productId').value;
  let oldProduct=id?products.find(x=>x.id===id):null;
  const data={
    code:document.getElementById('pCode').value.trim(),
    name:document.getElementById('pName').value.trim(),
    category:document.getElementById('pCategory').value,
    price:Number(document.getElementById('pPrice').value),
    p12Price:document.getElementById('pP12Price').value===''?null:Number(document.getElementById('pP12Price').value),
    qtyPrice1Qty:document.getElementById('pQtyPrice1Qty').value===''?null:Number(document.getElementById('pQtyPrice1Qty').value),
    qtyPrice1Price:document.getElementById('pQtyPrice1Price').value===''?null:Number(document.getElementById('pQtyPrice1Price').value),
    qtyPrice2Qty:document.getElementById('pQtyPrice2Qty').value===''?null:Number(document.getElementById('pQtyPrice2Qty').value),
    qtyPrice2Price:document.getElementById('pQtyPrice2Price').value===''?null:Number(document.getElementById('pQtyPrice2Price').value),
    crtPrice:document.getElementById('pCrtPrice').value===''?null:Number(document.getElementById('pCrtPrice').value),
    crtPcs:document.getElementById('pCrtPcs').value===''?null:Number(document.getElementById('pCrtPcs').value),
    crtFree:document.getElementById('pCrtFree').checked===true,
    stock:Number(document.getElementById('pStock').value),
    commission:Number(document.getElementById('pCommission').value||0),
    commissionBase:Number(document.getElementById('pCommissionBase').value||0),
    tpP12CommissionBase:Number(document.getElementById('pTpP12CommissionBase').value||0),
    tpCrtCommissionBase:Number(document.getElementById('pTpCrtCommissionBase').value||0),
    tpCommission:Boolean(document.getElementById('pTpCommission').checked),
    ob:Number(document.getElementById('pOb').value||0),
    photo:currentProductPhoto||''
  };
  if(!data.code||!data.name||!Number.isFinite(data.price)||!Number.isFinite(data.stock)){showToast('Vul alle verplichte velden in.');return;}
  const sameCode=await lookupProductByCode(data.code,{showMessage:false});
  // lookupProductByCode kan een bestaand product laden; gebruik daarna dat echte product-ID.
  if(sameCode){
    const formId=document.getElementById('productId').value;
    if(!id && formId===sameCode.id){
      id=sameCode.id;
      oldProduct=products.find(x=>x.id===id) || sameCode;
    } else if(sameCode.id!==id){
      fillProductForm(sameCode);
      showToast('Deze productcode bestaat al. Bestaande gegevens zijn geladen.');
      return;
    }
  }
  if(data.crtPrice!==null && (!Number.isFinite(data.crtPrice) || !Number.isFinite(data.crtPcs) || data.crtPcs<1)){
    showToast('Vul bij CRT ook het aantal PCS per CRT in.');return;
  }
  if((data.qtyPrice1Qty!==null)!=(data.qtyPrice1Price!==null)){showToast('Vul bij aantalprijs 1 zowel aantal als prijs in.');return;}
  if((data.qtyPrice2Qty!==null)!=(data.qtyPrice2Price!==null)){showToast('Vul bij aantalprijs 2 zowel aantal als prijs in.');return;}
  if(data.qtyPrice1Qty!==null && data.qtyPrice1Qty<2){showToast('Aantalprijs 1 moet minimaal 2 zijn.');return;}
  if(data.qtyPrice2Qty!==null && data.qtyPrice2Qty<2){showToast('Aantalprijs 2 moet minimaal 2 zijn.');return;}
  if(data.crtPrice===null){data.crtPcs=null;data.crtFree=false;}
  const effectiveId=id || document.getElementById('productId').value;
  if(effectiveId){
    await setDoc(doc(db,'products',effectiveId),data);
    products=products.map(p=>p.id===effectiveId?{...p,id:effectiveId,...data}:p);
  }else{
    const ref=await addDoc(collection(db,'products'),data);
    products.push({id:ref.id,...data});
  }
  if(oldProduct){
    const eachChanged=Number(oldProduct.price)!==Number(data.price);
    const oldCrt=oldProduct.crtPrice==null?null:Number(oldProduct.crtPrice);
    const newCrt=data.crtPrice==null?null:Number(data.crtPrice);
    const crtChanged=oldCrt!==newCrt;
    const oldP12=oldProduct.p12Price==null?null:Number(oldProduct.p12Price);
    const newP12=data.p12Price==null?null:Number(data.p12Price);
    const p12Changed=oldP12!==newP12;
    if(eachChanged||crtChanged||p12Changed){
      await addDoc(collection(db,'priceChanges'),{
        productId:effectiveId,
        productName:data.name,
        eachChanged,
        crtChanged,
        p12Changed,
        oldEachPrice:Number(oldProduct.price||0),
        newEachPrice:Number(data.price||0),
        oldP12Price:oldP12,
        newP12Price:newP12,
        oldCrtPrice:oldCrt,
        newCrtPrice:newCrt,
        changedAt:new Date().toISOString(),
        changedBy:currentUser.email
      });
    }
  }
  await loadProducts();
  autoSyncProductSig=currentProductSignature();
  resetProductForm();
  renderProducts();
  renderProductSearch();
  showToast('Product opgeslagen.');
};
document.getElementById('cancelProductBtn').onclick=resetProductForm;
document.getElementById('productsFilter').addEventListener('input',renderProducts);

function renderProducts(){
  const q=document.getElementById('productsFilter').value.toLowerCase().trim();
  let arr=products.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(q) arr=arr.filter(p=>p.name.toLowerCase().includes(q)||String(p.code).toLowerCase().includes(q));
  const body=document.getElementById('productsBody');
  body.innerHTML=arr.length?arr.map(p=>`<tr class="admin-product-row ${p.hiddenFromSales?'is-hidden':''}">
    <td>${p.photo?`<img class="product-thumb" src="${p.photo}" alt="">`:''}</td>
    <td><strong>${esc(p.code)}</strong></td><td class="admin-product-name">${esc(p.name)}</td><td>${esc(p.category||'-')}</td>
    <td>${money(p.price)}</td><td>${p.p12Price!=null?money(p.p12Price):'-'}</td>
    <td>${p.qtyPrice1Qty!=null?`${p.qtyPrice1Qty} = ${money(p.qtyPrice1Price)}`:'-'}</td>
    <td>${p.qtyPrice2Qty!=null?`${p.qtyPrice2Qty} = ${money(p.qtyPrice2Price)}`:'-'}</td>
    <td>${p.crtPrice!=null?money(p.crtPrice):'-'}</td><td>${p.crtPrice!=null?(p.crtPcs||'-'):'-'}</td>
    <td>${p.crtFree?'1 FREE':'-'}</td><td class="${Number(p.stock)<0?'admin-negative-stock':''}">${p.stock}</td>
    <td>${Number(p.commission||0).toFixed(2)}%</td>
    <td>${money(p.commissionBase||0)}</td><td>${money(p.tpP12CommissionBase||0)}</td>
    <td>${money(p.tpCrtCommissionBase||0)}</td><td>${p.tpCommission?'JA':'NEE'}</td>
    <td>${Number(p.ob||0).toFixed(2)}%</td>
    <td><span class="admin-status ${p.hiddenFromSales?'admin-status-hidden':'admin-status-visible'}">${p.hiddenFromSales?'Verborgen':'Zichtbaar'}</span></td>
    <td>${currentRole==='admin'?`<div class="admin-product-actions"><button class="icon-btn admin-edit-btn" data-edit="${p.id}">Bewerken</button><button class="icon-btn ${p.hiddenFromSales?'admin-show-btn':'admin-hide-btn'}" data-toggle-hidden="${p.id}">${p.hiddenFromSales?'Weer zichtbaar maken':'Verbergen'}</button></div>`:''}</td>
  </tr>`).join(''):'<tr><td colspan="20" class="muted">Geen producten.</td></tr>';
  body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const p=products.find(x=>x.id===b.dataset.edit); if(!p)return;
    fillProductForm(p);
    window.scrollTo({top:0,behavior:'smooth'});
  });
  body.querySelectorAll('[data-toggle-hidden]').forEach(b=>b.onclick=async()=>{
    if(currentRole!=='admin') return;
    const p=products.find(x=>x.id===b.dataset.toggleHidden);
    if(!p) return;
    const hidden=!p.hiddenFromSales;
    try {
      await updateDoc(doc(db,'products',p.id),{hiddenFromSales:hidden});
      p.hiddenFromSales=hidden;
      renderProducts(); renderProductSearch();
      showToast(hidden?'Product verborgen in SALES.':'Product weer zichtbaar in SALES.');
    } catch(e){ showToast('Opslaan mislukt: '+e.message); }
  });
}

document.getElementById('productSearch').addEventListener('input',renderProductSearch);
document.getElementById('saleCategoryFilter')?.addEventListener('change',renderProductSearch);

// Categorieknoppen voor directe selectie op de verkooptablet.
(function initSaleCategoryButtons(){
  const select=document.getElementById('saleCategoryFilter');
  const group=document.getElementById('saleCategoryButtons');
  if(!select || !group) return;
  const sync=()=>group.querySelectorAll('button').forEach(btn=>{
    const active=btn.dataset.category===select.value;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',String(active));
  });
  Array.from(select.options).forEach(option=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='sale-category-button';
    btn.dataset.category=option.value;
    btn.textContent=option.value ? option.textContent : 'ALLE';
    btn.addEventListener('click',()=>{
      select.value=option.value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      sync();
    });
    group.appendChild(btn);
  });
  select.addEventListener('change',sync);
  sync();
})();

function renderProductSearch(){
  const q=document.getElementById('productSearch').value.toLowerCase().trim();
  const words=q.split(/\s+/).filter(Boolean);

  const category=(document.getElementById('saleCategoryFilter')?.value||'').trim();

  let arr=products.slice().filter(p=>{
    if(p.hiddenFromSales===true) return false;
    if(category && String(p.category||'CANDY')!==category) return false;
    if(!words.length) return true;
    const hay=(String(p.name||'')+' '+String(p.code||'')).toLowerCase();
    return words.every(w=>hay.includes(w));
  });

  arr.sort((a,b)=>{
    if(!q) return a.name.localeCompare(b.name);
    const an=String(a.name||'').toLowerCase();
    const bn=String(b.name||'').toLowerCase();
    const ac=String(a.code||'').toLowerCase();
    const bc=String(b.code||'').toLowerCase();

    const score=(name,code)=>{
      if(code===q) return 0;
      if(name===q) return 1;
      if(code.startsWith(q)) return 2;
      if(name.startsWith(q)) return 3;
      if(name.split(/\s+/).some(w=>w.startsWith(q))) return 4;
      return 5;
    };

    return score(an,ac)-score(bn,bc) || an.localeCompare(bn);
  });
  const saleRow=(p,unit,label,price)=>`<div class="sale-unit-row"><div class="sale-unit-info"><b>${label}</b><span>${money(price)}</span></div><div class="sale-qty-control"><button type="button" class="sale-step" data-step="-1" aria-label="${label} verminderen">−</button><input class="sale-unit-qty" type="number" min="1" step="1" placeholder="Aantal" inputmode="numeric" aria-label="Aantal ${label}" data-qty-unit="${unit}" data-qty-product="${p.id}"><button type="button" class="sale-step" data-step="1" aria-label="${label} verhogen">+</button></div><button type="button" class="sale-add" data-sale-unit="${unit}" data-sale-product="${p.id}" aria-label="Voeg ${label} toe">Toevoegen</button></div>`;
  document.getElementById('productResults').innerHTML=arr.map(p=>`<article class="product-card sale-grid-card">${p.photo?`<img class="product-card-photo" src="${p.photo}" alt="${esc(p.name)}">`:''}<div class="sale-card-category">${esc(p.category||'CANDY')}</div><strong class="sale-card-name">${esc(p.name)}</strong><span class="sale-card-code">${esc(p.code||'')}</span><div class="sale-unit-list">${saleRow(p,'EACH','EACH',p.price)}${p.p12Price!=null?saleRow(p,'P12','P12',p.p12Price):''}${p.crtPrice!=null?saleRow(p,'CRT','CRT'+(p.crtFree?' +1 FREE':''),p.crtPrice):''}${p.qtyPrice1Qty!=null?saleRow(p,'DEAL1',p.qtyPrice1Qty+' EACH',p.qtyPrice1Price):''}${p.qtyPrice2Qty!=null?saleRow(p,'DEAL2',p.qtyPrice2Qty+' EACH',p.qtyPrice2Price):''}</div></article>`).join('')||'<div class="muted">Geen product gevonden.</div>';
  document.querySelectorAll('#productResults .sale-step').forEach(button=>button.addEventListener('click',()=>{
    const input=button.parentElement.querySelector('.sale-unit-qty');
    const current=Math.max(0,Math.floor(Number(input.value)||0));
    const next=Math.max(0,current+Number(button.dataset.step));
    input.value=next?String(next):'';
  }));
  document.querySelectorAll('[data-sale-unit]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.saleProduct, unit=button.dataset.saleUnit;
    const input=button.parentElement.querySelector('[data-qty-unit]');
    const qty=Number(input?.value);
    if(!Number.isInteger(qty)||qty<1){showToast('Vul een geldig aantal in.');input?.focus();return;}
    addToCart(id,unit,qty);
    if(input)input.value='';
  }));
}

function addToCart(id,unit='EACH',requestedQty=1){
  const p=products.find(x=>x.id===id);
  if(!p){showToast('Product niet gevonden.');return;}

  const addQty=Math.max(1,Math.floor(Number(requestedQty)||1));
  let unitsPerSale=1;
  let unitPrice=Number(p.price||0);
  let freePerCrt=0;
  let label='EACH';

  if(unit==='P12'){
    if(p.p12Price==null){showToast('P12-prijs is niet ingesteld.');return;}
    unitsPerSale=12;
    unitPrice=Number(p.p12Price);
    label='P12';
  }else if(unit==='DEAL1'){
    if(p.qtyPrice1Qty==null || p.qtyPrice1Price==null){showToast('Aantalprijs 1 is niet ingesteld.');return;}
    unitsPerSale=Number(p.qtyPrice1Qty);
    unitPrice=Number(p.qtyPrice1Price);
    label=`${unitsPerSale} EACH`;
  }else if(unit==='DEAL2'){
    if(p.qtyPrice2Qty==null || p.qtyPrice2Price==null){showToast('Aantalprijs 2 is niet ingesteld.');return;}
    unitsPerSale=Number(p.qtyPrice2Qty);
    unitPrice=Number(p.qtyPrice2Price);
    label=`${unitsPerSale} EACH`;
  }else if(unit==='CRT'){
    const crtPrice=Number(p.crtPrice);
    const crtPcs=Math.floor(Number(p.crtPcs));
    if(!Number.isFinite(crtPrice) || crtPrice<0){
      showToast('CRT-prijs ontbreekt bij dit product.');
      return;
    }
    if(!Number.isFinite(crtPcs) || crtPcs<1){
      showToast('Vul bij Producten eerst PCS per CRT in.');
      return;
    }
    unitsPerSale=crtPcs;
    unitPrice=crtPrice;
    freePerCrt=p.crtFree?1:0;
    label='CRT';
  }

  const stockUnitsPerSale=unitsPerSale+freePerCrt;
  const key=id+'_'+unit;
  const existing=cart.find(x=>x.key===key);
  const newQty=(existing?Number(existing.qty||0):0)+addQty;
  const pcsNeeded=newQty*stockUnitsPerSale;


  if(existing){
    existing.qty=newQty;
  }else{
    cart.push({
      key,
      productId:p.id,
      code:p.code,
      name:p.name,
      price:unitPrice,
      commission:p.commission||0,
      commissionBase:p.commissionBase||0,
      tpP12CommissionBase:p.tpP12CommissionBase||0,
      tpCrtCommissionBase:p.tpCrtCommissionBase||0,
      tpCommission:!!p.tpCommission,
      ob:p.ob||0,
      qty:addQty,
      unit,
      label,
      unitsPerSale,
      freePerCrt,
      stockUnitsPerSale
    });
  }

  renderCart();



  if(unit==='CRT'){
    showToast(`${addQty} CRT toegevoegd aan de factuur.`);
  }

  // Zoekveld pas NA succesvol toevoegen leegmaken.
  const saleSearch=document.getElementById('productSearch');
  if(saleSearch){
    saleSearch.value='';
    renderProductSearch();
    saleSearch.focus();
  }
}
function renderCart(){
  const body=document.getElementById('cartBody');
  const empty=document.getElementById('cartEmpty');
  const table=document.getElementById('cartTable');
  if(cart.length===0){empty.classList.remove('hidden');table.classList.add('hidden');}
  else{empty.classList.add('hidden');table.classList.remove('hidden');}

  body.innerHTML=cart.map((l,i)=>`
    <tr>
      <td><strong>${esc(l.code)}</strong></td>
      <td>
        ${esc(l.name)} <span class="unit-badge">${esc(l.label||l.unit)}</span>
        ${l.unit==='CRT'?`<div class="muted">${l.unitsPerSale} PCS per CRT${l.freePerCrt?` + ${l.freePerCrt} FREE`:''}</div>`:''}
      </td>
      <td>
        <div class="qty-stepper">
          <button type="button" class="qty-btn" data-dec="${i}" aria-label="Aantal verlagen">−</button>
          <span class="qty-value">${Number(l.qty||1)}</span>
          <button type="button" class="qty-btn" data-inc="${i}" aria-label="Aantal verhogen">+</button>
        </div>
      </td>
      <td>${money(l.price)}</td>
      <td>${money(l.price*l.qty)}</td>
      <td><button class="danger icon-btn" data-remove="${i}">X</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.dec);
    const l=cart[i];
    if(!l) return;
    l.qty=Math.max(1,Number(l.qty||1)-1);
    renderCart();
  });

  body.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.inc);
    const l=cart[i];
    if(!l) return;

    const p=products.find(x=>x.id===l.productId);
    const nextQty=Number(l.qty||1)+1;
    const unitsPerSale=Number(l.stockUnitsPerSale||l.unitsPerSale||1);
    const pcsNeeded=nextQty*unitsPerSale;


    l.qty=nextQty;
    renderCart();
  });

  body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    cart.splice(Number(b.dataset.remove),1);
    renderCart();
  });

  const subtotal=cart.reduce((s,l)=>s+calcLine(l).subtotal,0);
  const obTotal=cart.reduce((s,l)=>s+calcLine(l).obAmount,0);
  document.getElementById('cartSubtotal').textContent=money(subtotal);
  document.getElementById('cartObTotal').textContent=money(obTotal);
  document.getElementById('cartTotal').textContent=money(subtotal+obTotal);
  const countBadge=document.getElementById('cartCount');
  if(countBadge)countBadge.textContent=String(cart.reduce((n,l)=>n+(Number(l.qty)||0),0));
}
document.getElementById('clearCartBtn').onclick=()=>{cart=[];renderCart();};


function nextInvoiceNumber(){
  const d=today().replaceAll('-','');
  const prefix='MT-'+d+'-';
  const nums=sales.map(s=>String(s.invoiceNumber||'')).filter(x=>x.startsWith(prefix))
    .map(x=>Number(x.slice(prefix.length))).filter(Number.isFinite);
  const next=(nums.length?Math.max(...nums):0)+1;
  return prefix+String(next).padStart(3,'0');
}

async function saveCurrentSale({printAfter=false}={}){
  if(cart.length===0){showToast('Voeg eerst producten toe.');return null;}
  const customer=document.getElementById('saleCustomer').value.trim()||'Contant';

  for(const l of cart){
    const p=products.find(x=>x.id===l.productId);
    const pcsNeeded=Number(l.qty||0)*Number(l.stockUnitsPerSale||l.unitsPerSale||1);
    if(!p){showToast('Product niet gevonden: '+l.name);return null;}
  }

  if(customer!=='Contant' && !customers.some(c=>c.name.toLowerCase()===customer.toLowerCase())){
    const cref=doc(db,'customers',makeId('cust'));
    await setDoc(cref,{name:customer});
    customers.push({id:cref.id,name:customer}); renderCustomersDatalist();
  }

  const lines=cart.map(l=>{
    const c=calcLine(l);
    return {
      productId:l.productId,code:l.code,name:l.name,price:l.price,commission:l.commission,ob:l.ob||0,qty:l.qty,
      unit:l.unit||'EACH',label:l.label||l.unit||'EACH',unitsPerSale:Number(l.unitsPerSale||1),
      freePerCrt:Number(l.freePerCrt||0),
      freeQty:(l.unit==='CRT'?Number(l.qty||0)*Number(l.freePerCrt||0):0),
      stockPcs:Number(l.qty||0)*Number(l.stockUnitsPerSale||l.unitsPerSale||1),
      subtotal:c.subtotal,obAmount:c.obAmount,total:c.total,
      commissionBaseUsed:(
        l.tpCommission && l.unit==='P12' ? Number(l.tpP12CommissionBase||0) :
        l.tpCommission && l.unit==='CRT' ? Number(l.tpCrtCommissionBase||0) :
        Number(l.commissionBase||0)
      ),
      commissionAmount:commissionForLine(l)
    };
  });
  const subtotal=lines.reduce((s,l)=>s+l.subtotal,0);
  const obTotal=lines.reduce((s,l)=>s+l.obAmount,0);
  const total=subtotal+obTotal;

  const createdAt=new Date().toISOString();
  const invoiceNumber=nextInvoiceNumber();
  const sale={
    invoiceId:currentInvoiceId,invoiceNumber,date:today(),createdAt,customer,lines,
    subtotal,obTotal,total,
    commissionTotal:lines.reduce((s,l)=>s+l.commissionAmount,0),
    createdBy:currentUser.email
  };

  await setDoc(doc(db,'sales',currentInvoiceId),sale);
  const idx=sales.findIndex(s=>s.id===currentInvoiceId);
  if(idx>=0) sales[idx]={id:currentInvoiceId,...sale}; else sales.push({id:currentInvoiceId,...sale});

  for(const l of lines){
    const p=products.find(x=>x.id===l.productId);
    p.stock-=Number(l.stockPcs||l.qty||0);
    await updateDoc(doc(db,'products',p.id),{stock:p.stock});
  }

  const printable={...sale};
  cart=[]; currentInvoiceId=makeId('inv');
  document.getElementById('saleCustomer').value='';
  autoSyncProductSig=currentProductSignature();
  autoSyncSalesSig=currentSalesSignature();
  renderAll();
  showToast(navigator.onLine?'Invoice opgeslagen.':'Invoice offline opgeslagen; synchroniseert later.');
  if(printAfter) printSavedInvoice(printable);
  return printable;
}



function printSavedInvoice(sale){
  const invoiceHtml = `<h1>Maxi-Truck</h1>
  <div class="invoice-meta">
    <div><strong>Factuurnummer:</strong> ${esc(sale.invoiceNumber||sale.invoiceId)}</div>
    <div><strong>Klant:</strong> ${esc(sale.customer)}</div>
    <div><strong>Datum:</strong> ${new Date(sale.createdAt).toLocaleDateString('nl-NL')}</div>
    <div><strong>Tijd:</strong> ${new Date(sale.createdAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>
  <table><tr><th>Code</th><th>Product</th><th>Aantal</th><th>Prijs excl. OB</th><th>Bedrag</th></tr>
  ${sale.lines.map(l=>`<tr><td>${esc(l.code)}</td><td>${esc(l.name)} (${esc(l.label||l.unit||'EACH')})</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.subtotal)}</td></tr>${l.freeQty?`<tr><td></td><td>+ FREE</td><td>${l.freeQty}</td><td>CG 0.00</td><td>CG 0.00</td></tr>`:''}`).join('')}
  </table>
  <hr>
  <p style="text-align:right"><strong>Subtotaal excl. OB:</strong> ${money(sale.subtotal)}</p>
  <p style="text-align:right"><strong>OB:</strong> ${money(sale.obTotal)}</p>
  <h2 style="text-align:right">Totaal incl. OB: ${money(sale.total)}</h2>`;
  // Two physical copies from one saved sale; no duplicate sale or stock deduction.
  printHtml(`<section class="invoice-copy">${invoiceHtml}<p><strong>KLANT</strong></p></section><section class="invoice-copy">${invoiceHtml}<p><strong>MAXI-TRUCK</strong></p></section>`);
}

let salePrintBusy=false;
document.getElementById('printSaleBtn').onclick=async()=>{
  if(salePrintBusy)return;
  salePrintBusy=true;
  const btn=document.getElementById('printSaleBtn');
  btn.disabled=true;
  try { await saveCurrentSale({printAfter:true}); }
  catch(err){console.error('Verkoop opslaan/printen mislukt:',err);showToast('Opslaan mislukt. Probeer opnieuw; controleer eerst verkoopgeschiedenis.');}
  finally {salePrintBusy=false;btn.disabled=false;}
};

document.getElementById('historyDate').value=today();
document.getElementById('historyDate').addEventListener('change',renderHistory);
function renderHistory(){
  const date=document.getElementById('historyDate').value||today();
  const arr=sales.filter(s=>s.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  document.getElementById('salesHistory').innerHTML=arr.length?arr.map(s=>`<div class="sale-card"><div class="sale-head"><span>${esc(s.invoiceNumber||'')} • ${esc(s.customer)}</span><span>${money(s.total)}</span></div><div>${new Date(s.createdAt).toLocaleDateString('nl-NL')} ${new Date(s.createdAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}</div><div class="sale-lines">${s.lines.map(l=>`${esc(l.code)} — ${esc(l.name)} (${esc(l.label||l.unit||'EACH')}) × ${l.qty} = ${money(l.subtotal ?? (l.price*l.qty))} excl. OB${l.freeQty?`<br>+ FREE × ${l.freeQty} = CG 0.00`:''}`).join('<br>')}<br><strong>OB:</strong> ${money(s.obTotal||0)} • <strong>Totaal incl. OB:</strong> ${money(s.total)}</div></div>`).join(''):'<div class="muted">Geen verkopen op deze datum.</div>';
}

document.getElementById('closingDate').value=today();
document.getElementById('closingDate').addEventListener('change',renderClosing);
document.getElementById('countedCash').addEventListener('input',updateDifference);

function closingData(date){
  const daySales=sales.filter(s=>s.date===date), grouped={};
  daySales.forEach(s=>s.lines.forEach(l=>{
    const k=l.productId||l.code;
    const groupKey=k+'_'+(l.unit||'EACH');
    if(!grouped[groupKey])grouped[groupKey]={code:l.code,name:l.name,unit:l.unit||'EACH',qty:0,freeQty:0,stockPcs:0,total:0,subtotal:0,obTotal:0,commission:0};
    grouped[groupKey].qty+=l.qty;
    grouped[groupKey].freeQty+=Number(l.freeQty||0);
    grouped[groupKey].stockPcs+=Number(l.stockPcs||l.qty||0);
    grouped[groupKey].subtotal+=(l.subtotal ?? (l.price*l.qty));
    grouped[groupKey].obTotal+=(l.obAmount||0);
    grouped[groupKey].total+=l.total;
    grouped[groupKey].commission+=l.commissionAmount||0;
  }));
  return {
    products:Object.values(grouped).sort((a,b)=>a.name.localeCompare(b.name)),
    subtotal:daySales.reduce((s,x)=>s+(x.subtotal ?? (x.total-(x.obTotal||0))),0),
    obTotal:daySales.reduce((s,x)=>s+(x.obTotal||0),0),
    total:daySales.reduce((s,x)=>s+x.total,0),
    commission:daySales.reduce((s,x)=>s+(x.commissionTotal||0),0)
  };
}
function renderClosing(){
  if(currentRole!=='admin')return;
  const date=document.getElementById('closingDate').value||today(), d=closingData(date);
  document.getElementById('closingSummary').innerHTML=d.products.length?`<div class="summary-box">${d.products.map(p=>`<div class="closing-row"><div><strong>${esc(p.code)}</strong> — ${esc(p.name)} <span class="unit-badge">${esc(p.unit||'EACH')}</span></div><div>${p.qty} ${p.unit==='CRT'?'CRT':'EACH'}${p.unit==='CRT'?` (${p.stockPcs} PCS${p.freeQty?`, incl. ${p.freeQty} FREE`:''})`:''}</div><div>${money(p.total)}</div></div>`).join('')}<div class="summary-line"><strong>Subtotaal excl. OB</strong><strong>${money(d.subtotal)}</strong></div><div class="summary-line"><strong>OB</strong><strong>${money(d.obTotal)}</strong></div><div class="summary-line"><strong>Totaal incl. OB</strong><strong>${money(d.total)}</strong></div><div class="summary-line"><strong>Totale commissie</strong><strong>${money(d.commission)}</strong></div></div>`:'<div class="muted">Nog geen verkopen voor deze dag.</div>';
  document.getElementById('closingSalesTotal').value=money(d.total);
  document.getElementById('closingCommission').value=money(d.commission);
  updateDifference();
}
function updateDifference(){
  const date=document.getElementById('closingDate').value||today(), d=closingData(date);
  const val=Number(document.getElementById('countedCash').value||0);
  const diff=val-d.total;
  document.getElementById('cashDifference').value=money(diff);
}
document.getElementById('saveClosingBtn').onclick=async()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan de dag afsluiten.');return;}
  const date=document.getElementById('closingDate').value||today(), d=closingData(date);
  const counted=Number(document.getElementById('countedCash').value);
  if(!Number.isFinite(counted)){showToast('Vul geteld geld in.');return;}
  await setDoc(doc(db,'closings',date),{
    date,salesTotal:d.total,countedCash:counted,difference:counted-d.total,commission:d.commission,savedAt:new Date().toISOString()
  });
  showToast('Dagafsluiting opgeslagen.');
};
document.getElementById('printClosingBtn').onclick=()=>{
  if(currentRole!=='admin')return;
  const date=document.getElementById('closingDate').value||today(), d=closingData(date);
  const counted=Number(document.getElementById('countedCash').value||0), diff=counted-d.total;
  printHtml(`<h1>Maxi-Truck — Dagafsluiting</h1><p><strong>Datum:</strong> ${esc(date)}</p><table><tr><th>Code</th><th>Product</th><th>Aantal</th><th>Totaal</th></tr>${d.products.map(p=>`<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${p.qty}</td><td>${money(p.total)}</td></tr>`).join('')}</table><p><strong>Totale verkoop:</strong> ${money(d.total)}</p><p><strong>Geld geteld:</strong> ${money(counted)}</p><p><strong>Verschil:</strong> ${money(diff)}</p><p><strong>Totale commissie:</strong> ${money(d.commission)}</p>`);
};

function printHtml(html){
  const w=window.open('','_blank','width=850,height=700');
  if(!w){showToast('Sta pop-ups toe om te printen.');return;}
  w.document.write(`<!doctype html><html><head><title>Maxi-Truck</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.invoice-copy+.invoice-copy{break-before:page;page-break-before:always}@media print{.invoice-copy{break-inside:avoid}}</style></head><body>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}


document.getElementById('clearProductSearchBtn')?.addEventListener('click',()=>{
  const el=document.getElementById('productSearch');
  if(!el) return;
  el.value='';
  renderProductSearch();
  el.focus();
});

document.getElementById('backToTopBtn')?.addEventListener('click',()=>{
  window.scrollTo({top:0,behavior:'smooth'});
});

window.addEventListener('scroll',()=>{
  const btn=document.getElementById('backToTopBtn');
  if(btn) btn.style.display=window.scrollY>350?'block':'none';
});

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs) await reg.unregister();
    }catch(e){}
  });
}

// Vergroot productfoto met één tik, sluit met kruis, buiten de foto of Escape.
(() => {
  const overlay = document.getElementById('photoZoom');
  const large = document.getElementById('photoZoomImage');
  const close = () => { overlay.classList.add('hidden'); large.removeAttribute('src'); };
  document.addEventListener('click', (event) => {
    const img = event.target.closest('img.product-card-photo, img.product-thumb, img#photoPreview');
    if (!img || !img.getAttribute('src')) return;
    large.src = img.src;
    large.alt = img.alt || 'Vergrote productfoto';
    overlay.classList.remove('hidden');
  });
  document.getElementById('photoZoomClose').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
})();

// Winkelmandje in compacte tabletweergave
(function(){
  const toggle=document.getElementById('tabletCartToggle');
  const close=document.getElementById('tabletCartClose');
  const card=document.getElementById('invoiceCard');
  if(!toggle||!card)return;
  function setOpen(open){
    card.classList.toggle('tablet-cart-open',open);
    toggle.setAttribute('aria-expanded',String(open));
    if(open)card.scrollIntoView({behavior:'smooth',block:'start'});
  }
  toggle.addEventListener('click',()=>setOpen(!card.classList.contains('tablet-cart-open')));
  close?.addEventListener('click',()=>setOpen(false));
})();
