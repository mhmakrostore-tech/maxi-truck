(function(){
'use strict';

var STORAGE = {
  products: 'maxiTruck_products_v1',
  customers: 'maxiTruck_customers_v1',
  sales: 'maxiTruck_sales_v1',
  closings: 'maxiTruck_closings_v1'
};

var state = {
  products: load(STORAGE.products, []),
  customers: load(STORAGE.customers, []),
  sales: load(STORAGE.sales, []),
  closings: load(STORAGE.closings, []),
  cart: []
};

function load(key, fallback){
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e) { return fallback; }
}
function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function uid(prefix){ return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function money(n){ return 'CG ' + Number(n || 0).toFixed(2); }
function today(){
  var d=new Date(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+'-'+m+'-'+day;
}
function localDateTime(iso){
  var d=new Date(iso);
  return d.toLocaleString('nl-NL');
}
function toast(msg){
  var el=document.getElementById('toast');
  el.textContent=msg; el.classList.remove('hidden');
  setTimeout(function(){el.classList.add('hidden');},2200);
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});
}

function seed(){
  if(state.products.length===0){
    state.products=[
      {id:uid('p'),code:'78211',name:'Voorbeeld product A',price:3.79,stock:24,commission:5},
      {id:uid('p'),code:'78212',name:'Voorbeeld product B',price:5.25,stock:12,commission:7.5}
    ];
    save(STORAGE.products,state.products);
  }
}
seed();

var views=document.querySelectorAll('.view');
document.querySelectorAll('.tabs button').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.tabs button').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    views.forEach(function(v){v.classList.remove('active');});
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
    if(btn.dataset.view==='products') renderProducts();
    if(btn.dataset.view==='customers') renderCustomers();
    if(btn.dataset.view==='history') renderHistory();
    if(btn.dataset.view==='closing') renderClosing();
  });
});

function renderCustomersDatalist(){
  var list=document.getElementById('customerList');
  list.innerHTML=state.customers.slice().sort(function(a,b){return a.name.localeCompare(b.name);}).map(function(c){
    return '<option value="'+esc(c.name)+'"></option>';
  }).join('');
}
function addCustomer(name){
  name=(name||'').trim();
  if(!name) return;
  var exists=state.customers.some(function(c){return c.name.toLowerCase()===name.toLowerCase();});
  if(exists){toast('Deze klant bestaat al.');return;}
  state.customers.push({id:uid('c'),name:name});
  save(STORAGE.customers,state.customers);
  renderCustomers(); renderCustomersDatalist(); toast('Klant toegevoegd.');
}
document.getElementById('addCustomerBtn').onclick=function(){
  addCustomer(document.getElementById('newCustomer').value);
  document.getElementById('newCustomer').value='';
};
function renderCustomers(){
  var el=document.getElementById('customersList');
  var arr=state.customers.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
  el.innerHTML=arr.length?arr.map(function(c){
    return '<div class="customer-row"><strong>'+esc(c.name)+'</strong><button class="danger icon-btn" data-del-customer="'+c.id+'">Verwijderen</button></div>';
  }).join(''):'<div class="muted">Nog geen klanten.</div>';
  el.querySelectorAll('[data-del-customer]').forEach(function(b){
    b.onclick=function(){
      if(confirm('Klant verwijderen?')){
        state.customers=state.customers.filter(function(c){return c.id!==b.dataset.delCustomer;});
        save(STORAGE.customers,state.customers); renderCustomers(); renderCustomersDatalist();
      }
    };
  });
}

function productFormReset(){
  ['productId','pCode','pName','pPrice','pStock','pCommission'].forEach(function(id){document.getElementById(id).value='';});
}
document.getElementById('saveProductBtn').onclick=function(){
  var id=document.getElementById('productId').value;
  var code=document.getElementById('pCode').value.trim();
  var name=document.getElementById('pName').value.trim();
  var price=parseFloat(document.getElementById('pPrice').value);
  var stock=parseInt(document.getElementById('pStock').value,10);
  var commission=parseFloat(document.getElementById('pCommission').value)||0;
  if(!code||!name||isNaN(price)||isNaN(stock)){toast('Vul code, naam, prijs en voorraad in.');return;}
  var duplicate=state.products.some(function(p){return p.code.toLowerCase()===code.toLowerCase() && p.id!==id;});
  if(duplicate){toast('Deze productcode bestaat al.');return;}
  if(id){
    var p=state.products.find(function(x){return x.id===id;});
    if(p){p.code=code;p.name=name;p.price=price;p.stock=stock;p.commission=commission;}
  }else{
    state.products.push({id:uid('p'),code:code,name:name,price:price,stock:stock,commission:commission});
  }
  save(STORAGE.products,state.products); productFormReset(); renderProducts(); renderProductSearch(); toast('Product opgeslagen.');
};
document.getElementById('cancelProductBtn').onclick=productFormReset;
document.getElementById('productsFilter').addEventListener('input',renderProducts);

function renderProducts(){
  var q=document.getElementById('productsFilter').value.toLowerCase().trim();
  var arr=state.products.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
  if(q) arr=arr.filter(function(p){return p.name.toLowerCase().includes(q)||p.code.toLowerCase().includes(q);});
  var body=document.getElementById('productsBody');
  body.innerHTML=arr.length?arr.map(function(p){
    return '<tr><td><strong>'+esc(p.code)+'</strong></td><td>'+esc(p.name)+'</td><td>'+money(p.price)+'</td><td>'+p.stock+'</td><td>'+Number(p.commission||0).toFixed(2)+'%</td><td><button class="icon-btn" data-edit="'+p.id+'">Bewerken</button> <button class="danger icon-btn" data-delete="'+p.id+'">Verwijderen</button></td></tr>';
  }).join(''):'<tr><td colspan="6" class="muted">Geen producten.</td></tr>';
  body.querySelectorAll('[data-edit]').forEach(function(b){
    b.onclick=function(){
      var p=state.products.find(function(x){return x.id===b.dataset.edit;});
      if(!p) return;
      document.getElementById('productId').value=p.id;
      document.getElementById('pCode').value=p.code;
      document.getElementById('pName').value=p.name;
      document.getElementById('pPrice').value=p.price;
      document.getElementById('pStock').value=p.stock;
      document.getElementById('pCommission').value=p.commission||0;
      window.scrollTo({top:0,behavior:'smooth'});
    };
  });
  body.querySelectorAll('[data-delete]').forEach(function(b){
    b.onclick=function(){
      if(confirm('Product verwijderen?')){
        state.products=state.products.filter(function(p){return p.id!==b.dataset.delete;});
        save(STORAGE.products,state.products); renderProducts(); renderProductSearch();
      }
    };
  });
}

function renderProductSearch(){
  var q=document.getElementById('productSearch').value.toLowerCase().trim();
  var arr=state.products.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
  if(q) arr=arr.filter(function(p){return p.name.toLowerCase().includes(q)||p.code.toLowerCase().includes(q);});
  if(!q) arr=arr.slice(0,8);
  var el=document.getElementById('productResults');
  el.innerHTML=arr.map(function(p){
    return '<div class="product-card"><div class="code">Code: '+esc(p.code)+'</div><strong>'+esc(p.name)+'</strong><div>'+money(p.price)+'</div><div class="stock '+(p.stock<=5?'low':'')+'">Voorraad: '+p.stock+'</div><div>Commissie: '+Number(p.commission||0).toFixed(2)+'%</div><button data-add="'+p.id+'" '+(p.stock<=0?'disabled':'')+'>Toevoegen</button></div>';
  }).join('') || '<div class="muted">Geen product gevonden.</div>';
  el.querySelectorAll('[data-add]').forEach(function(b){
    b.onclick=function(){ addToCart(b.dataset.add); };
  });
}
document.getElementById('productSearch').addEventListener('input',renderProductSearch);

function addToCart(productId){
  var p=state.products.find(function(x){return x.id===productId;});
  if(!p || p.stock<=0) return;
  var line=state.cart.find(function(x){return x.productId===productId;});
  if(line){
    if(line.qty>=p.stock){toast('Niet genoeg voorraad.');return;}
    line.qty++;
  }else{
    state.cart.push({productId:p.id,code:p.code,name:p.name,price:p.price,commission:p.commission||0,qty:1});
  }
  renderCart();
}
function renderCart(){
  var body=document.getElementById('cartBody');
  var empty=document.getElementById('cartEmpty');
  var table=document.getElementById('cartTable');
  if(state.cart.length===0){empty.classList.remove('hidden');table.classList.add('hidden');}
  else{empty.classList.add('hidden');table.classList.remove('hidden');}
  body.innerHTML=state.cart.map(function(l,i){
    return '<tr><td><strong>'+esc(l.code)+'</strong></td><td>'+esc(l.name)+'</td><td><input style="width:75px" type="number" min="1" value="'+l.qty+'" data-qty="'+i+'"></td><td>'+money(l.price)+'</td><td>'+money(l.price*l.qty)+'</td><td><button class="danger icon-btn" data-remove="'+i+'">X</button></td></tr>';
  }).join('');
  body.querySelectorAll('[data-qty]').forEach(function(inp){
    inp.onchange=function(){
      var i=parseInt(inp.dataset.qty,10), l=state.cart[i], p=state.products.find(function(x){return x.id===l.productId;});
      var q=Math.max(1,parseInt(inp.value,10)||1);
      if(p && q>p.stock){q=p.stock;toast('Aantal aangepast aan beschikbare voorraad.');}
      l.qty=q; renderCart();
    };
  });
  body.querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){state.cart.splice(parseInt(b.dataset.remove,10),1);renderCart();};});
  document.getElementById('cartTotal').textContent=money(state.cart.reduce(function(s,l){return s+l.price*l.qty;},0));
}
document.getElementById('clearCartBtn').onclick=function(){state.cart=[];renderCart();};

function ensureCustomer(name){
  name=(name||'').trim();
  if(!name) return;
  if(!state.customers.some(function(c){return c.name.toLowerCase()===name.toLowerCase();})){
    state.customers.push({id:uid('c'),name:name}); save(STORAGE.customers,state.customers); renderCustomersDatalist();
  }
}
document.getElementById('saveSaleBtn').onclick=function(){
  if(state.cart.length===0){toast('Voeg eerst producten toe.');return;}
  var customer=document.getElementById('saleCustomer').value.trim() || 'Contant';
  for(var i=0;i<state.cart.length;i++){
    var l=state.cart[i], p=state.products.find(function(x){return x.id===l.productId;});
    if(!p || p.stock<l.qty){toast('Niet genoeg voorraad voor '+l.name);return;}
  }
  ensureCustomer(customer);
  var lines=state.cart.map(function(l){
    return {productId:l.productId,code:l.code,name:l.name,price:l.price,commission:l.commission,qty:l.qty,
      total:l.price*l.qty, commissionAmount:(l.price*l.qty)*(Number(l.commission||0)/100)};
  });
  lines.forEach(function(l){
    var p=state.products.find(function(x){return x.id===l.productId;}); if(p) p.stock-=l.qty;
  });
  var sale={id:uid('s'),createdAt:new Date().toISOString(),date:today(),customer:customer,lines:lines,
    total:lines.reduce(function(s,l){return s+l.total;},0),
    commissionTotal:lines.reduce(function(s,l){return s+l.commissionAmount;},0)};
  state.sales.push(sale); save(STORAGE.sales,state.sales); save(STORAGE.products,state.products);
  state.cart=[]; renderCart(); renderProductSearch(); document.getElementById('saleCustomer').value='';
  toast('Verkoop opgeslagen en voorraad aangepast.');
};
document.getElementById('printSaleBtn').onclick=function(){
  if(state.cart.length===0){toast('Geen factuur om te printen.');return;}
  var customer=document.getElementById('saleCustomer').value.trim()||'Contant';
  var total=state.cart.reduce(function(s,l){return s+l.price*l.qty;},0);
  var html='<h1>Maxi-Truck</h1><p><strong>Klant:</strong> '+esc(customer)+'</p><p><strong>Datum:</strong> '+localDateTime(new Date().toISOString())+'</p><table style="width:100%;border-collapse:collapse"><tr><th>Code</th><th>Product</th><th>Aantal</th><th>Prijs</th><th>Totaal</th></tr>'+
    state.cart.map(function(l){return '<tr><td>'+esc(l.code)+'</td><td>'+esc(l.name)+'</td><td>'+l.qty+'</td><td>'+money(l.price)+'</td><td>'+money(l.price*l.qty)+'</td></tr>';}).join('')+
    '</table><h2 style="text-align:right">Totaal: '+money(total)+'</h2>';
  printHtml(html);
};

document.getElementById('historyDate').value=today();
document.getElementById('historyDate').addEventListener('change',renderHistory);
function renderHistory(){
  var date=document.getElementById('historyDate').value||today();
  var arr=state.sales.filter(function(s){return s.date===date;}).sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);});
  var el=document.getElementById('salesHistory');
  el.innerHTML=arr.length?arr.map(function(s){
    return '<div class="sale-card"><div class="sale-head"><span>'+esc(s.customer)+'</span><span>'+money(s.total)+'</span></div><div>'+localDateTime(s.createdAt)+'</div><div class="sale-lines">'+s.lines.map(function(l){return esc(l.code)+' — '+esc(l.name)+' × '+l.qty+' = '+money(l.total);}).join('<br>')+'</div></div>';
  }).join(''):'<div class="muted">Geen verkopen op deze datum.</div>';
}

document.getElementById('closingDate').value=today();
document.getElementById('closingDate').addEventListener('change',renderClosing);
document.getElementById('countedCash').addEventListener('input',updateDifference);

function closingData(date){
  var sales=state.sales.filter(function(s){return s.date===date;});
  var grouped={};
  sales.forEach(function(s){
    s.lines.forEach(function(l){
      var key=l.productId||l.code;
      if(!grouped[key]) grouped[key]={code:l.code,name:l.name,qty:0,total:0,commission:0};
      grouped[key].qty+=l.qty; grouped[key].total+=l.total; grouped[key].commission+=l.commissionAmount||0;
    });
  });
  return {
    sales:sales,
    products:Object.keys(grouped).map(function(k){return grouped[k];}).sort(function(a,b){return a.name.localeCompare(b.name);}),
    total:sales.reduce(function(sum,s){return sum+s.total;},0),
    commission:sales.reduce(function(sum,s){return sum+(s.commissionTotal||0);},0)
  };
}
function renderClosing(){
  var date=document.getElementById('closingDate').value||today(), d=closingData(date);
  var el=document.getElementById('closingSummary');
  if(!d.products.length) el.innerHTML='<div class="muted">Nog geen verkopen voor deze dag.</div>';
  else el.innerHTML='<div class="summary-box">'+d.products.map(function(p){
    return '<div class="closing-row"><div><strong>'+esc(p.code)+'</strong> — '+esc(p.name)+'</div><div>'+p.qty+' stuks</div><div>'+money(p.total)+'</div></div>';
  }).join('')+'<div class="summary-line"><strong>Totaal alle producten</strong><strong>'+money(d.total)+'</strong></div><div class="summary-line"><strong>Totale commissie</strong><strong>'+money(d.commission)+'</strong></div></div>';
  document.getElementById('closingSalesTotal').value=money(d.total);
  document.getElementById('closingCommission').value=money(d.commission);
  var saved=state.closings.find(function(c){return c.date===date;});
  document.getElementById('countedCash').value=saved?saved.countedCash:'';
  updateDifference();
  var msg=document.getElementById('closingSavedMsg');
  if(saved){msg.textContent='Deze dag is opgeslagen. Geteld geld: '+money(saved.countedCash)+' • Verschil: '+money(saved.difference);msg.classList.remove('hidden');}
  else msg.classList.add('hidden');
}
function updateDifference(){
  var date=document.getElementById('closingDate').value||today(), d=closingData(date);
  var raw=document.getElementById('countedCash').value;
  var val=raw===''?null:parseFloat(raw);
  var diff=(val===null||isNaN(val))?0:val-d.total;
  var el=document.getElementById('cashDifference');
  el.value=money(diff);
  el.classList.remove('negative','positive','zero');
  el.classList.add(diff<0?'negative':diff>0?'positive':'zero');
}
document.getElementById('saveClosingBtn').onclick=function(){
  var date=document.getElementById('closingDate').value||today(), d=closingData(date);
  var counted=parseFloat(document.getElementById('countedCash').value);
  if(isNaN(counted)){toast('Vul eerst het getelde geld in.');return;}
  var closing={date:date,salesTotal:d.total,countedCash:counted,difference:counted-d.total,commission:d.commission,savedAt:new Date().toISOString()};
  state.closings=state.closings.filter(function(c){return c.date!==date;});
  state.closings.push(closing); save(STORAGE.closings,state.closings); renderClosing(); toast('Dagafsluiting opgeslagen.');
};
document.getElementById('printClosingBtn').onclick=function(){
  var date=document.getElementById('closingDate').value||today(), d=closingData(date);
  var counted=parseFloat(document.getElementById('countedCash').value)||0;
  var diff=counted-d.total;
  var html='<h1>Maxi-Truck — Dagafsluiting</h1><p><strong>Datum:</strong> '+esc(date)+'</p><table style="width:100%;border-collapse:collapse"><tr><th>Code</th><th>Product</th><th>Aantal</th><th>Totaal</th></tr>'+
    d.products.map(function(p){return '<tr><td>'+esc(p.code)+'</td><td>'+esc(p.name)+'</td><td>'+p.qty+'</td><td>'+money(p.total)+'</td></tr>';}).join('')+
    '</table><hr><p><strong>Totale verkoop:</strong> '+money(d.total)+'</p><p><strong>Geld geteld:</strong> '+money(counted)+'</p><p><strong>Verschil:</strong> '+money(diff)+'</p><p><strong>Totale commissie:</strong> '+money(d.commission)+'</p>';
  printHtml(html);
};
function printHtml(html){
  var w=window.open('','_blank','width=850,height=700');
  if(!w){toast('Sta pop-ups toe om te printen.');return;}
  w.document.write('<!doctype html><html><head><title>Maxi-Truck</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body>'+html+'</body></html>');
  w.document.close(); w.focus(); setTimeout(function(){w.print();},300);
}

var deferredPrompt=null, installBtn=document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;installBtn.classList.remove('hidden');});
installBtn.addEventListener('click',function(){if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;installBtn.classList.add('hidden');}});

if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('service-worker.js').catch(function(){});});}

renderCustomersDatalist(); renderProductSearch(); renderCart(); renderProducts(); renderCustomers(); renderHistory(); renderClosing();
})();