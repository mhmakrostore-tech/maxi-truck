
import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  collection, doc, getDocs, setDoc, addDoc, deleteDoc, updateDoc
} from './firebase-app.js';

const ADMIN_EMAIL = 'mh.makrostore@gmail.com';
const TABLET_EMAIL = 'maxitrucktablet@maxitruck.local';

let currentUser = null;
let currentRole = null;
let products = [];
let customers = [];
let sales = [];
let cart = [];

const money = n => 'CG ' + Number(n || 0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showToast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),2200);
}

function showApp(user){
  currentUser=user;
  currentRole = user.email === ADMIN_EMAIL ? 'admin' : (user.email === TABLET_EMAIL ? 'sales' : null);

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
}

document.querySelectorAll('.tabs button').forEach(btn=>{
  btn.addEventListener('click',()=>openView(btn.dataset.view));
});

document.getElementById('emailLoginBtn').onclick=async()=>{
  try{
    await signInWithEmailAndPassword(auth,
      document.getElementById('loginEmail').value.trim(),
      document.getElementById('loginPassword').value
    );
  }catch(e){document.getElementById('authStatus').textContent='Inloggen mislukt: '+e.message;}
};
document.getElementById('googleLoginBtn').onclick=async()=>{
  try{ await signInWithPopup(auth, googleProvider); }
  catch(e){document.getElementById('authStatus').textContent='Google-login mislukt: '+e.message;}
};
document.getElementById('logoutBtn').onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>user?showApp(user):hideApp());

async function loadAll(){
  await Promise.all([loadProducts(),loadCustomers(),loadSales()]);
  renderAll();
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

function renderAll(){
  renderProducts(); renderProductSearch(); renderCustomers(); renderCustomersDatalist(); renderHistory(); renderClosing(); renderCart();
}

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
  customers.push({id:ref.id,name}); document.getElementById('newCustomer').value=''; renderCustomers(); renderCustomersDatalist();
};

function renderCustomers(){
  const el=document.getElementById('customersList');
  const arr=customers.slice().sort((a,b)=>a.name.localeCompare(b.name));
  el.innerHTML=arr.length?arr.map(c=>`<div class="customer-row"><strong>${esc(c.name)}</strong>${currentRole==='admin'?`<button class="danger icon-btn" data-del-customer="${c.id}">Verwijderen</button>`:''}</div>`).join(''):'<div class="muted">Nog geen klanten.</div>';
  el.querySelectorAll('[data-del-customer]').forEach(b=>b.onclick=async()=>{
    await deleteDoc(doc(db,'customers',b.dataset.delCustomer));
    customers=customers.filter(c=>c.id!==b.dataset.delCustomer); renderCustomers(); renderCustomersDatalist();
  });
}

function resetProductForm(){
  ['productId','pCode','pName','pPrice','pStock','pCommission'].forEach(id=>document.getElementById(id).value='');
}
document.getElementById('saveProductBtn').onclick=async()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan producten wijzigen.');return;}
  const id=document.getElementById('productId').value;
  const data={
    code:document.getElementById('pCode').value.trim(),
    name:document.getElementById('pName').value.trim(),
    price:Number(document.getElementById('pPrice').value),
    stock:Number(document.getElementById('pStock').value),
    commission:Number(document.getElementById('pCommission').value||0)
  };
  if(!data.code||!data.name||!Number.isFinite(data.price)||!Number.isFinite(data.stock)){showToast('Vul alle verplichte velden in.');return;}
  if(id){
    await setDoc(doc(db,'products',id),data);
    products=products.map(p=>p.id===id?{id,...data}:p);
  }else{
    const ref=await addDoc(collection(db,'products'),data);
    products.push({id:ref.id,...data});
  }
  resetProductForm(); renderProducts(); renderProductSearch(); showToast('Product opgeslagen.');
};
document.getElementById('cancelProductBtn').onclick=resetProductForm;
document.getElementById('productsFilter').addEventListener('input',renderProducts);

function renderProducts(){
  const q=document.getElementById('productsFilter').value.toLowerCase().trim();
  let arr=products.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(q) arr=arr.filter(p=>p.name.toLowerCase().includes(q)||String(p.code).toLowerCase().includes(q));
  const body=document.getElementById('productsBody');
  body.innerHTML=arr.length?arr.map(p=>`<tr><td><strong>${esc(p.code)}</strong></td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${Number(p.commission||0).toFixed(2)}%</td><td>${currentRole==='admin'?`<button class="icon-btn" data-edit="${p.id}">Bewerken</button> <button class="danger icon-btn" data-delete="${p.id}">Verwijderen</button>`:''}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">Geen producten.</td></tr>';
  body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const p=products.find(x=>x.id===b.dataset.edit); if(!p)return;
    document.getElementById('productId').value=p.id;
    document.getElementById('pCode').value=p.code;
    document.getElementById('pName').value=p.name;
    document.getElementById('pPrice').value=p.price;
    document.getElementById('pStock').value=p.stock;
    document.getElementById('pCommission').value=p.commission||0;
    window.scrollTo({top:0,behavior:'smooth'});
  });
  body.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
    if(confirm('Product verwijderen?')){
      await deleteDoc(doc(db,'products',b.dataset.delete));
      products=products.filter(p=>p.id!==b.dataset.delete); renderProducts(); renderProductSearch();
    }
  });
}

document.getElementById('productSearch').addEventListener('input',renderProductSearch);
function renderProductSearch(){
  const q=document.getElementById('productSearch').value.toLowerCase().trim();
  let arr=products.slice().sort((a,b)=>a.name.localeCompare(b.name));
  if(q) arr=arr.filter(p=>p.name.toLowerCase().includes(q)||String(p.code).toLowerCase().includes(q));
  if(!q) arr=arr.slice(0,8);
  document.getElementById('productResults').innerHTML=arr.map(p=>`<div class="product-card"><div class="code">Code: ${esc(p.code)}</div><strong>${esc(p.name)}</strong><div>${money(p.price)}</div><div class="stock ${p.stock<=5?'low':''}">Voorraad: ${p.stock}</div><div>Commissie: ${Number(p.commission||0).toFixed(2)}%</div><button data-add="${p.id}" ${p.stock<=0?'disabled':''}>Toevoegen</button></div>`).join('')||'<div class="muted">Geen product gevonden.</div>';
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addToCart(b.dataset.add));
}

function addToCart(id){
  const p=products.find(x=>x.id===id); if(!p||p.stock<=0)return;
  const l=cart.find(x=>x.productId===id);
  if(l){if(l.qty>=p.stock){showToast('Niet genoeg voorraad.');return;} l.qty++;}
  else cart.push({productId:p.id,code:p.code,name:p.name,price:p.price,commission:p.commission||0,qty:1});
  renderCart();
}
function renderCart(){
  const body=document.getElementById('cartBody');
  const empty=document.getElementById('cartEmpty');
  const table=document.getElementById('cartTable');
  if(cart.length===0){empty.classList.remove('hidden');table.classList.add('hidden');}
  else{empty.classList.add('hidden');table.classList.remove('hidden');}
  body.innerHTML=cart.map((l,i)=>`<tr><td><strong>${esc(l.code)}</strong></td><td>${esc(l.name)}</td><td><input style="width:75px" type="number" min="1" value="${l.qty}" data-qty="${i}"></td><td>${money(l.price)}</td><td>${money(l.price*l.qty)}</td><td><button class="danger icon-btn" data-remove="${i}">X</button></td></tr>`).join('');
  body.querySelectorAll('[data-qty]').forEach(inp=>inp.onchange=()=>{
    const i=Number(inp.dataset.qty), l=cart[i], p=products.find(x=>x.id===l.productId);
    let q=Math.max(1,Number(inp.value)||1); if(p&&q>p.stock)q=p.stock; l.qty=q; renderCart();
  });
  body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart();});
  document.getElementById('cartTotal').textContent=money(cart.reduce((s,l)=>s+l.price*l.qty,0));
}
document.getElementById('clearCartBtn').onclick=()=>{cart=[];renderCart();};

document.getElementById('saveSaleBtn').onclick=async()=>{
  if(cart.length===0){showToast('Voeg eerst producten toe.');return;}
  const customer=document.getElementById('saleCustomer').value.trim()||'Contant';

  for(const l of cart){
    const p=products.find(x=>x.id===l.productId);
    if(!p||p.stock<l.qty){showToast('Niet genoeg voorraad voor '+l.name);return;}
  }

  if(customer!=='Contant' && !customers.some(c=>c.name.toLowerCase()===customer.toLowerCase())){
    const ref=await addDoc(collection(db,'customers'),{name:customer});
    customers.push({id:ref.id,name:customer}); renderCustomersDatalist();
  }

  const lines=cart.map(l=>({
    productId:l.productId,code:l.code,name:l.name,price:l.price,commission:l.commission,qty:l.qty,
    total:l.price*l.qty,commissionAmount:(l.price*l.qty)*(Number(l.commission||0)/100)
  }));
  const sale={
    date:today(),createdAt:new Date().toISOString(),customer,
    lines,total:lines.reduce((s,l)=>s+l.total,0),
    commissionTotal:lines.reduce((s,l)=>s+l.commissionAmount,0),
    createdBy:currentUser.email
  };
  const sref=await addDoc(collection(db,'sales'),sale);
  sales.push({id:sref.id,...sale});

  for(const l of lines){
    const p=products.find(x=>x.id===l.productId); p.stock-=l.qty;
    await updateDoc(doc(db,'products',p.id),{stock:p.stock});
  }
  cart=[]; document.getElementById('saleCustomer').value=''; renderAll(); showToast('Verkoop opgeslagen.');
};

document.getElementById('printSaleBtn').onclick=()=>{
  if(cart.length===0){showToast('Geen factuur om te printen.');return;}
  const customer=document.getElementById('saleCustomer').value.trim()||'Contant';
  const total=cart.reduce((s,l)=>s+l.price*l.qty,0);
  printHtml(`<h1>Maxi-Truck</h1><p><strong>Klant:</strong> ${esc(customer)}</p><p><strong>Datum:</strong> ${new Date().toLocaleString('nl-NL')}</p><table><tr><th>Code</th><th>Product</th><th>Aantal</th><th>Prijs</th><th>Totaal</th></tr>${cart.map(l=>`<tr><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.price*l.qty)}</td></tr>`).join('')}</table><h2 style="text-align:right">Totaal: ${money(total)}</h2>`);
};

document.getElementById('historyDate').value=today();
document.getElementById('historyDate').addEventListener('change',renderHistory);
function renderHistory(){
  const date=document.getElementById('historyDate').value||today();
  const arr=sales.filter(s=>s.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  document.getElementById('salesHistory').innerHTML=arr.length?arr.map(s=>`<div class="sale-card"><div class="sale-head"><span>${esc(s.customer)}</span><span>${money(s.total)}</span></div><div>${new Date(s.createdAt).toLocaleString('nl-NL')}</div><div class="sale-lines">${s.lines.map(l=>`${esc(l.code)} — ${esc(l.name)} × ${l.qty} = ${money(l.total)}`).join('<br>')}</div></div>`).join(''):'<div class="muted">Geen verkopen op deze datum.</div>';
}

document.getElementById('closingDate').value=today();
document.getElementById('closingDate').addEventListener('change',renderClosing);
document.getElementById('countedCash').addEventListener('input',updateDifference);

function closingData(date){
  const daySales=sales.filter(s=>s.date===date), grouped={};
  daySales.forEach(s=>s.lines.forEach(l=>{
    const k=l.productId||l.code;
    if(!grouped[k])grouped[k]={code:l.code,name:l.name,qty:0,total:0,commission:0};
    grouped[k].qty+=l.qty; grouped[k].total+=l.total; grouped[k].commission+=l.commissionAmount||0;
  }));
  return {
    products:Object.values(grouped).sort((a,b)=>a.name.localeCompare(b.name)),
    total:daySales.reduce((s,x)=>s+x.total,0),
    commission:daySales.reduce((s,x)=>s+(x.commissionTotal||0),0)
  };
}
function renderClosing(){
  if(currentRole!=='admin')return;
  const date=document.getElementById('closingDate').value||today(), d=closingData(date);
  document.getElementById('closingSummary').innerHTML=d.products.length?`<div class="summary-box">${d.products.map(p=>`<div class="closing-row"><div><strong>${esc(p.code)}</strong> — ${esc(p.name)}</div><div>${p.qty} stuks</div><div>${money(p.total)}</div></div>`).join('')}<div class="summary-line"><strong>Totaal alle producten</strong><strong>${money(d.total)}</strong></div><div class="summary-line"><strong>Totale commissie</strong><strong>${money(d.commission)}</strong></div></div>`:'<div class="muted">Nog geen verkopen voor deze dag.</div>';
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
  w.document.write(`<!doctype html><html><head><title>Maxi-Truck</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}));}
