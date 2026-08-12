window.addEventListener('unhandledrejection',e=>{
  console.error('Onverwerkte fout:',e.reason);
});

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
let currentProductPhoto = '';
let currentInvoiceId = makeId('inv');
let pendingPriceChanges = [];

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

  // TP products: if sold as P12 or CRT, calculate on that sold unit price.
  if(line.tpCommission && (line.unit==='P12' || line.unit==='CRT')){
    return Number(line.price||0) * Number(line.qty||0) * pct;
  }

  // All other products: use this product's own fixed commission basis.
  return Number(line.commissionBase||0) * Number(line.qty||0) * pct;
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
  await Promise.all([loadProducts(),loadCustomers(),loadSales()]);
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

function renderAll(){
  renderProducts(); renderProductSearch(); renderCustomers(); renderCustomersDatalist(); renderHistory(); renderClosing(); renderCart(); renderRestock();
}


function renderRestock(){
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

document.getElementById('restockFilter')?.addEventListener('input',renderRestock);

document.getElementById('clearRestockBtn')?.addEventListener('click',()=>{
  document.querySelectorAll('[data-restock]').forEach(inp=>inp.value='');
  renderRestock();
});

document.getElementById('saveRestockBtn')?.addEventListener('click',async()=>{
  if(currentRole!=='admin'){showToast('Alleen beheerder kan voorraad aanvullen.');return;}

  const inputs=[...document.querySelectorAll('[data-restock]')];
  const changes=inputs
    .map(inp=>({id:inp.dataset.restock,add:Number(inp.value||0)}))
    .filter(x=>Number.isFinite(x.add)&&x.add>0);

  if(changes.length===0){showToast('Vul minimaal één aantal in.');return;}

  try{
    for(const ch of changes){
      const p=products.find(x=>x.id===ch.id);
      if(!p) continue;
      p.stock=Number(p.stock||0)+ch.add;
      await updateDoc(doc(db,'products',p.id),{stock:p.stock});
    }
    renderAll();
    showToast(changes.length+' voorraadregels opgeslagen.');
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


function fillProductForm(p){
  if(!p) return;
  document.getElementById('productId').value=p.id;
  document.getElementById('pCode').value=p.code||'';
  document.getElementById('pName').value=p.name||'';
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
  document.getElementById('pCrtFree').checked=false;
  setPhotoPreview('');
  document.getElementById('pCommissionBase').value='';
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
  body.innerHTML=arr.length?arr.map(p=>`<tr><td>${p.photo?`<img class="product-thumb" src="${p.photo}" alt="">`:''}</td><td><strong>${esc(p.code)}</strong></td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td>${p.p12Price!=null?money(p.p12Price):'-'}</td><td>${p.qtyPrice1Qty!=null?`${p.qtyPrice1Qty} = ${money(p.qtyPrice1Price)}`:'-'}</td><td>${p.qtyPrice2Qty!=null?`${p.qtyPrice2Qty} = ${money(p.qtyPrice2Price)}`:'-'}</td><td>${p.crtPrice!=null?money(p.crtPrice):'-'}</td><td>${p.crtPrice!=null?(p.crtPcs||'-'):'-'}</td><td>${p.crtFree?'1 FREE':'-'}</td><td>${p.stock}</td><td>${Number(p.commission||0).toFixed(2)}%</td><td>${Number(p.ob||0).toFixed(2)}%</td><td>${currentRole==='admin'?`<button class="icon-btn" data-edit="${p.id}">Bewerken</button> <button class="danger icon-btn" data-delete="${p.id}">Verwijderen</button>`:''}</td></tr>`).join(''):'<tr><td colspan="14" class="muted">Geen producten.</td></tr>';
  body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const p=products.find(x=>x.id===b.dataset.edit); if(!p)return;
    fillProductForm(p);
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
  document.getElementById('productResults').innerHTML=arr.map(p=>`<div class="product-card">${p.photo?`<img class="product-card-photo" src="${p.photo}" alt="">`:''}<strong>${esc(p.name)}</strong><div class="code">Code: ${esc(p.code)}</div><div><strong>${money(p.price)}</strong> <span class="muted">(EACH, excl. OB)</span></div>${p.p12Price!=null?`<div><strong>${money(p.p12Price)}</strong> <span class="muted">(P12, excl. OB)</span></div>`:''}${p.qtyPrice1Qty!=null?`<div><strong>${money(p.qtyPrice1Price)}</strong> <span class="muted">(${p.qtyPrice1Qty} EACH, excl. OB)</span></div>`:''}${p.qtyPrice2Qty!=null?`<div><strong>${money(p.qtyPrice2Price)}</strong> <span class="muted">(${p.qtyPrice2Qty} EACH, excl. OB)</span></div>`:''}${p.crtPrice!=null?`<div><strong>${money(p.crtPrice)}</strong> <span class="muted">(CRT ${p.crtPcs} PCS, excl. OB)</span>${p.crtFree?` <span class="free-badge">+ 1 FREE</span>`:''}</div>`:''}<div class="sale-choice"><button data-add-each="${p.id}" ${p.stock<=0?'disabled':''}>EACH</button>${p.p12Price!=null?`<button class="secondary" data-add-p12="${p.id}" ${p.stock<12?'disabled':''}>P12</button>`:''}${p.qtyPrice1Qty!=null?`<button class="secondary" data-add-deal1="${p.id}" ${p.stock<p.qtyPrice1Qty?'disabled':''}>${p.qtyPrice1Qty} EACH</button>`:''}${p.qtyPrice2Qty!=null?`<button class="secondary" data-add-deal2="${p.id}" ${p.stock<p.qtyPrice2Qty?'disabled':''}>${p.qtyPrice2Qty} EACH</button>`:''}${p.crtPrice!=null?`<button class="secondary" data-add-crt="${p.id}" ${p.stock<(p.crtPcs||1)?'disabled':''}>CRT</button>`:''}</div></div>`).join('')||'<div class="muted">Geen product gevonden.</div>';
  document.querySelectorAll('[data-add-each]').forEach(b=>b.onclick=()=>addToCart(b.dataset.addEach,'EACH'));
  document.querySelectorAll('[data-add-p12]').forEach(b=>b.onclick=()=>addToCart(b.dataset.addP12,'P12'));
  document.querySelectorAll('[data-add-deal1]').forEach(b=>b.onclick=()=>addToCart(b.dataset.addDeal1,'DEAL1'));
  document.querySelectorAll('[data-add-deal2]').forEach(b=>b.onclick=()=>addToCart(b.dataset.addDeal2,'DEAL2'));
  document.querySelectorAll('[data-add-crt]').forEach(b=>b.onclick=()=>addToCart(b.dataset.addCrt,'CRT'));
}

function addToCart(id,unit='EACH'){
  const p=products.find(x=>x.id===id); if(!p)return;

  const isCrt=unit==='CRT';
  const isP12=unit==='P12';
  const isDeal1=unit==='DEAL1';
  const isDeal2=unit==='DEAL2';

  let unitsPerSale=1, unitPrice=Number(p.price), freePerCrt=0, label='EACH';

  if(isP12){
    if(p.p12Price==null){showToast('P12-prijs is niet ingesteld.');return;}
    unitsPerSale=12; unitPrice=Number(p.p12Price); label='P12';
  } else if(isDeal1){
    if(p.qtyPrice1Qty==null||p.qtyPrice1Price==null){showToast('Aantalprijs 1 is niet ingesteld.');return;}
    unitsPerSale=Number(p.qtyPrice1Qty); unitPrice=Number(p.qtyPrice1Price); label=`${unitsPerSale} EACH`;
  } else if(isDeal2){
    if(p.qtyPrice2Qty==null||p.qtyPrice2Price==null){showToast('Aantalprijs 2 is niet ingesteld.');return;}
    unitsPerSale=Number(p.qtyPrice2Qty); unitPrice=Number(p.qtyPrice2Price); label=`${unitsPerSale} EACH`;
  } else if(isCrt){
    if(p.crtPrice==null || !p.crtPcs){showToast('CRT is niet ingesteld voor dit product.');return;}
    freePerCrt=p.crtFree?1:0;
    unitsPerSale=Number(p.crtPcs);
    unitPrice=Number(p.crtPrice);
    label='CRT';
  }

  const stockUnitsPerSale=unitsPerSale+freePerCrt;
  if(p.stock<stockUnitsPerSale){showToast('Niet genoeg voorraad.');return;}

  const key=id+'_'+unit;
  const l=cart.find(x=>x.key===key);
  if(l){
    const pcsNeeded=(l.qty+1)*stockUnitsPerSale;
    if(pcsNeeded>p.stock){showToast('Niet genoeg voorraad.');return;}
    l.qty++;
  }else{
    cart.push({
      key,productId:p.id,code:p.code,name:p.name,price:unitPrice,commission:p.commission||0,commissionBase:p.commissionBase||0,tpCommission:!!p.tpCommission,ob:p.ob||0,
      qty:1,unit,label,unitsPerSale,freePerCrt,stockUnitsPerSale
    });
  }
  renderCart();
  // v21: na product toevoegen zoekveld bij Verkoop automatisch leegmaken
  const saleSearch = document.getElementById('productSearch');
  if (saleSearch) {
    saleSearch.value = '';
    renderProductResults('');
    saleSearch.focus();
  }

}
function renderCart(){
  const body=document.getElementById('cartBody');
  const empty=document.getElementById('cartEmpty');
  const table=document.getElementById('cartTable');
  if(cart.length===0){empty.classList.remove('hidden');table.classList.add('hidden');}
  else{empty.classList.add('hidden');table.classList.remove('hidden');}
  body.innerHTML=cart.map((l,i)=>`<tr><td><strong>${esc(l.code)}</strong></td><td>${esc(l.name)} <span class="unit-badge">${esc(l.label||l.unit)}</span>${l.unit==='CRT'?`<div class="muted">${l.unitsPerSale} PCS per CRT${l.freePerCrt?` + ${l.freePerCrt} FREE`:''}</div>`:''}</td><td><input style="width:75px" type="number" min="1" value="${l.qty}" data-qty="${i}"></td><td>${money(l.price)}</td><td>${money(l.price*l.qty)}</td><td><button class="danger icon-btn" data-remove="${i}">X</button></td></tr>`).join('');
  body.querySelectorAll('[data-qty]').forEach(inp=>inp.onchange=()=>{
    const i=Number(inp.dataset.qty), l=cart[i], p=products.find(x=>x.id===l.productId);
    let q=Math.max(1,Number(inp.value)||1);
    const maxQty=p?Math.floor(Number(p.stock||0)/Number(l.stockUnitsPerSale||l.unitsPerSale||1)):q;
    if(q>maxQty){q=Math.max(1,maxQty);showToast('Aantal aangepast aan beschikbare voorraad.');}
    l.qty=q; renderCart();
  });
  body.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.remove),1);renderCart();});
  const subtotal=cart.reduce((s,l)=>s+calcLine(l).subtotal,0);
  const obTotal=cart.reduce((s,l)=>s+calcLine(l).obAmount,0);
  document.getElementById('cartSubtotal').textContent=money(subtotal);
  document.getElementById('cartObTotal').textContent=money(obTotal);
  document.getElementById('cartTotal').textContent=money(subtotal+obTotal);
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
    if(!p||p.stock<pcsNeeded){showToast('Niet genoeg voorraad voor '+l.name);return null;}
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
      commissionBaseUsed:(l.tpCommission && (l.unit==='P12' || l.unit==='CRT')) ? Number(l.price||0) : Number(l.commissionBase||0),
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
  renderAll();
  showToast(navigator.onLine?'Invoice opgeslagen.':'Invoice offline opgeslagen; synchroniseert later.');
  if(printAfter) printSavedInvoice(printable);
  return printable;
}

document.getElementById('saveSaleBtn').onclick=()=>saveCurrentSale({printAfter:false});

function printSavedInvoice(sale){
  printHtml(`<h1>Maxi-Truck</h1>
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
  <h2 style="text-align:right">Totaal incl. OB: ${money(sale.total)}</h2>`);
}

document.getElementById('printSaleBtn').onclick=()=>saveCurrentSale({printAfter:true});

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
  w.document.write(`<!doctype html><html><head><title>Maxi-Truck</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body>${html}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs) await reg.unregister();
    }catch(e){}
  });
}
