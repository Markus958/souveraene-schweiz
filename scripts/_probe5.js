var fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
var W=process.cwd(), SEITE=path.join(W,'ngo','index.html');
var SK=['assets/vendor/d3-force-bundle.min.js','assets/ngo/ngo-netz-daten.js',
        'assets/ngo/ngo-netz-ansicht.js','assets/ngo/ngo-netz-seite.js'];
(async function(){
  var dom=new JSDOM(fs.readFileSync(SEITE,'utf8'),{runScripts:'dangerously',
    url:'http://localhost/ngo/index.html?person=452',pretendToBeVisual:true});
  var w=dom.window,d=w.document;
  w.fetch=function(p){var f=path.resolve(path.dirname(SEITE),String(p));
    return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(JSON.parse(fs.readFileSync(f,'utf8')))});};
  w.SVGElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,width:650,height:600,right:650,bottom:600};};
  Object.defineProperty(w,'innerWidth',{value:1440});
  if(d.readyState==='loading') await new Promise(r=>d.addEventListener('DOMContentLoaded',r));
  SK.forEach(function(r){var s=d.createElement('script');s.textContent=fs.readFileSync(path.join(W,r),'utf8');d.body.appendChild(s);});
  await new Promise(r=>setTimeout(r,2500));
  console.log('Personenfokus: orgs', d.querySelectorAll('.ngo-organisation').length,
              'person', d.querySelectorAll('.ngo-person').length);
  var org=d.querySelector('.ngo-organisation');
  console.log('Titel:', org.getAttribute('aria-label').slice(0,90));
  org.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await new Promise(r=>setTimeout(r,500));
  console.log('nach Klick: URL', w.location.search);
  console.log('  orgs', d.querySelectorAll('.ngo-organisation').length,
              'Liste', d.getElementById('nnListe').hidden===false);
  console.log('  Brotkrumen:', d.getElementById('nnBrotkrumen').textContent.trim().slice(0,60));
  console.log('  Detail:', d.getElementById('nnDetail').textContent.slice(0,60));
  console.log('  Status:', d.getElementById('nnStatus').textContent.slice(0,120));
})();
