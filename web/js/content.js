/* =========================================================
   CONTENT: objects, NPCs, levels, scenarios
   ========================================================= */
const objects=[];
function addObj(kind,x,y,w,h,o={}){
  const ob=Object.assign({kind,x,y,w,h,frames:o.frames||PROPS[kind],fps:0,layer:'y',dx:0,dy:0,zb:0,solid:true,phase:Math.random()*10},o);
  objects.push(ob);return ob;
}
function desk(x,y,type,acc,o={}){const d=addObj('desk',x,y,2,1,Object.assign({frames:deskFrames(type,acc||''),fps:2,info:'desk'},o));addObj('chairUp',x,y+1,1,1,{dx:8,noShadow:true});return d}
function placeObjects(){
  objects.length=0;
  /* IT */
  for(let i=1;i<=5;i++)addObj('rack',i,3,1,1,{frames:PROPS.rack.map((_,k)=>PROPS.rack[(k+i*2)%6]),fps:3,info:'rack'});
  for(let i=1;i<=3;i++)addObj('rack',i,7,1,1,{frames:PROPS.rack.map((_,k)=>PROPS.rack[(k+i*3+1)%6]),fps:4,info:'rack'});
  addObj('soc',8,1,6,2,{layer:'wall',fps:2,dy:3,info:'soc',solid:false});
  desk(9,5,'dash','lamp',{id:'adaDesk',info:'adaDesk'});
  addObj('cabinet',1,11,1,1,{info:'cabinet'});addObj('cabinet',2,11,1,1,{info:'cabinet'});
  addObj('plant',13,11,1,1,{fps:1,info:'plant'});addObj('snake',13,3,1,1,{fps:.7,info:'plant'});
  /* Executive */
  addObj('meeting',21,6,5,2,{id:'meeting',info:'meeting'});
  for(let i=0;i<5;i++){addObj('chairDown',21+i,5,1,1,{noShadow:true});addObj('chairUp',21+i,8,1,1,{noShadow:true})}
  addObj('tv',22,1,3,2,{layer:'wall',fps:1.5,dy:2,info:'tv',solid:false});
  addObj('bookshelf',30,3,2,1,{info:'books'});
  addObj('execDesk',28,10,3,1,{id:'execDesk',info:'execDesk'});addObj('chairDown',29,9,1,1,{noShadow:true,solid:true});
  addObj('bigPlant',16,3,1,1,{fps:.8,info:'plant'});addObj('bigPlant',32,12,1,1,{fps:.8,info:'plant'});addObj('snake',16,12,1,1,{fps:.7,info:'plant'});
  addObj('laptop',23,7,1,1,{id:'laptop',dy:-12,zb:2,solid:false,levels:['orientation'],info:'laptop'});
  /* HR */
  desk(36,5,'mail','plant');desk(39,5,'code','papers');
  addObj('bookshelf',43,3,2,1,{info:'books'});
  for(let i=0;i<4;i++)addObj('cabinet',46+i,3,1,1,{info:'cabinet'});
  addObj('sofa',45,11,3,1,{id:'hrSofa',info:'sofa'});
  addObj('plant',34,3,1,1,{fps:1,info:'plant'});addObj('bigPlant',50,12,1,1,{fps:.8,info:'plant'});addObj('snake',34,12,1,1,{fps:.7,info:'plant'});
  addObj('phone',46,11,1,1,{id:'phoneHR',dy:-14,zb:2,solid:false,fps:6,levels:['signals'],info:'phone'});
  /* Open office */
  desk(2,18,'code','lamp');desk(9,18,'mail','plant');desk(12,18,'code','phone',{id:'devDesk',info:'devDesk'});
  desk(17,18,'dash','papers');desk(20,18,'mail','plant');desk(27,18,'code','lamp');desk(30,18,'mail','');
  desk(35,18,'mail','plant');desk(38,18,'off','papers');desk(44,18,'code','lamp');desk(47,18,'dash','plant');
  desk(2,22,'mail','papers');desk(9,22,'sticky','',{id:'stickyDesk',info:'stickyDesk'});desk(12,22,'off','plant');
  desk(17,22,'code','');desk(20,22,'off','lamp');desk(27,22,'mine','phone',{id:'myDesk',info:'myDesk'});desk(30,22,'chart','plant');
  desk(35,22,'off','lamp');desk(38,22,'code','papers');desk(44,22,'mail','');desk(47,22,'off','plant');
  addObj('cooler',33,16,1,1,{fps:3,info:'cooler'});
  addObj('printer',48,16,2,1,{id:'printer',fps:1.2,info:'printer'});
  addObj('bookshelf',45,16,2,1,{info:'books'});
  addObj('bigPlant',1,16,1,1,{fps:.8,info:'plant'});addObj('plant',50,26,1,1,{fps:1,info:'plant'});addObj('snake',1,26,1,1,{fps:.7,info:'plant'});addObj('bigPlant',15,16,1,1,{fps:.8,info:'plant'});addObj('plant',32,26,1,1,{fps:1,info:'plant'});
  addObj('trash',14,19,1,1,{info:'trash'});addObj('trash',33,23,1,1,{info:'trash'});
  addObj('clock',14,14,1,1,{layer:'wall',solid:false,dy:6,dx:0,info:'clock'});
  /* Cafeteria */
  addObj('counter',2,30,6,1,{info:'coffee'});addObj('fridge',8,30,1,1,{info:'fridge'});addObj('vending',11,30,2,1,{fps:1.5,info:'vending'});
  [[4,34],[12,34],[17,36]].forEach(([x,y],i)=>{addObj('table',x,y,2,1,{info:'table',id:'cafeTable'+i});addObj('stool',x-1,y,1,1,{frames:[PROPS.stool[i%3]],info:'table'});addObj('stool',x+2,y,1,1,{frames:[PROPS.stool[(i+1)%3]],info:'table'})});
  addObj('bigPlant',1,30,1,1,{fps:.8,info:'plant'});addObj('plant',20,38,1,1,{fps:1,info:'plant'});addObj('snake',1,38,1,1,{fps:.7,info:'plant'});addObj('trash',19,30,1,1,{info:'trash'});
  addObj('qr',15,29,2,1,{id:'qr',layer:'none',solid:false,info:'qr',frames:null,hl:{x:15*T+3,y:28*T,w:26,h:31}});
  addObj('usb',8,37,1,1,{id:'usb',info:'usb',dy:-4,levels:['orientation']});
  addObj('phone',12,34,1,1,{id:'phoneCafe',dy:-12,zb:2,solid:false,fps:6,levels:['signals'],info:'phone'});
  /* Lobby */
  addObj('reception',25,33,5,1,{id:'reception',info:'reception'});
  addObj('aquarium',45,30,2,1,{fps:4,info:'aquarium'});
  addObj('notice',31,36,2,1,{id:'notice',info:'notice'});
  addObj('sofa',42,37,3,1,{id:'lobbySofa',info:'sofa'});addObj('armchair',47,36,1,1,{info:'sofa',dx:4});addObj('coffeeTable',42,35,3,1,{info:'table',dx:8,noShadow:false});
  addObj('phone',43,37,1,1,{id:'phoneLobby',dy:-14,zb:2,solid:false,fps:6,levels:['signals'],info:'phone'});
  addObj('bigPlant',22,30,1,1,{fps:.8,info:'plant'});addObj('bigPlant',50,30,1,1,{fps:.8,info:'plant'});addObj('snake',22,38,1,1,{fps:.7,info:'plant'});addObj('plant',50,38,1,1,{fps:1,info:'plant'});addObj('plant',32,30,1,1,{fps:1,info:'plant'});addObj('plant',39,30,1,1,{fps:1,info:'plant'});
}
const objById=id=>objects.find(o=>o.id===id);

/* ---------- people ---------- */
const P={
  you:pal({...sk('med'),hairStyle:'messy',tie:'#c8363d',lanyard:true}),
  ada:pal({...sk('dark'),hair:'#18120f',hairH:'#3a2a22',hairS:'#0e0a08',hairStyle:'curly',glasses:true,coat:'#1d6f69',coatS:'#165450',coatH:'#2a8f87',shirt:'#f4f1e6',lanyard:true,pants:'#25272f'}),
  mira:pal({...sk('light'),hair:'#7a3b22',hairH:'#a0563a',hairS:'#5a2a18',hairStyle:'long',coat:'#8e2f45',coatS:'#6e2234',coatH:'#a8455d',shirt:'#fbeee6',skirt:true,pants:'#3a3d48',pantsS:'#2c2f38'}),
  rex:pal({...sk('light'),hair:'#d9a441',hairH:'#f0c46a',hairS:'#a8782a',hairStyle:'spiky',coat:'#6b7280',coatS:'#525863',coatH:'#848b97',tie:'#e0b52c',pants:'#3b3f4a'}),
  dev:pal({...sk('brown'),hair:'#141010',hairStyle:'short',glasses:true,coat:'#3f6b3a',coatS:'#30542c',coatH:'#4f8449',shirt:'#cfe3f5',pants:'#3a3a40'}),
  priya:pal({...sk('tan'),hair:'#15100e',hairH:'#33261f',hairStyle:'bun',coat:'#5a4b8a',coatS:'#463a6d',coatH:'#6e5ea5',shirt:'#f6f1ff',skirt:true,pants:'#2b2f45',pantsS:'#1f2236'}),
  hale:pal({...sk('light'),hair:'#a7adb5',hairH:'#d1d5db',hairS:'#7d838b',hairStyle:'gray',coat:'#30333a',coatS:'#23252b',coatH:'#454952',tie:'#2f4a8a',pants:'#26282e'}),
  sam:pal({...sk('med'),hair:'#5a3a24',hairH:'#7a5638',hairStyle:'short',coat:'#b39a74',coatS:'#937c5a',coatH:'#c8b18c',tie:'#6b3f22',pants:'#4a4237'}),
  neha:pal({...sk('tan'),hair:'#1a1210',hairH:'#382820',hairStyle:'long',coat:'#2e5d8a',coatS:'#234a6f',coatH:'#3c74a8',shirt:'#ffffff',skirt:true,pants:'#2b2e38'}),
  arjun:pal({...sk('brown'),hair:'#1b1412',hairStyle:'messy',coat:'#40444f',coatS:'#30333c',coatH:'#525764',tie:'#9b2c2c',pants:'#2b2e38'}),
  courier:pal({...sk('med'),hair:'#3a2a20',hairStyle:'cap',cap:'#c0392b',coat:'#8a5a2b',coatS:'#6e4620',coatH:'#a26c35',shirt:'#e8d7b5',pants:'#3b5b8a',pantsS:'#2e4870',box:true}),
  kiran:pal({...sk('brown'),hair:'#211816',hairStyle:'short',coat:'#344054',coatS:'#273041',coatH:'#465670',tie:'#22c55e'}),
  lena:pal({...sk('light'),hair:'#e6c27a',hairH:'#f6dca3',hairStyle:'long',coat:'#a14d7a',coatS:'#813d61',coatH:'#bb6392',skirt:true}),
  omar:pal({...sk('tan'),hair:'#1a1412',hairStyle:'short',coat:'#4b5563',coatS:'#3a424e',coatH:'#5d6878',tie:'#3b82f6'}),
  tess:pal({...sk('dark'),hair:'#120d0b',hairStyle:'bun',coat:'#c26a2b',coatS:'#9c5420',coatH:'#d9823f'}),
  ravi:pal({...sk('med'),hair:'#2a1d18',hairStyle:'messy',coat:'#2e6b5a',coatS:'#235446',coatH:'#3a8571',tie:'#f5b941'}),
  vik:pal({...sk('tan'),hair:'#2a1d18',hairStyle:'cap',cap:'#2563eb',coat:'#1e3a8a',coatS:'#172d6b',coatH:'#2747a6',shirt:'#e5e7eb',vest:'#f59e0b',pants:'#334155'}),
  kabir:pal({...sk('brown'),hair:'#1a1210',hairStyle:'short',coat:'#475569',coatS:'#334155',coatH:'#64748b',tie:'#0ea5e9',lanyard:true}),
  zoe:pal({...sk('light'),hair:'#3b2416',hairH:'#5c3a24',hairStyle:'long',coat:'#0f766e',coatS:'#0b5c56',coatH:'#14928a',skirt:true,lanyard:true}),
};
const NPCDEF=[
  {id:'ada',name:'Ada Okoye',x:11,y:8,dir:'down'},
  {id:'mira',name:'Mira',x:27,y:32,dir:'down'},
  {id:'rex',name:'Rex',x:22,y:21,dir:'down',mode:'wander',area:[14,20,26,7]},
  {id:'dev',name:'Dev',x:12,y:19,dir:'up',mode:'sit'},
  {id:'priya',name:'Priya',x:44,y:7,dir:'down'},
  {id:'hale',name:'Mr. Hale',x:28,y:5,dir:'down'},
  {id:'sam',name:'Sam',x:32,y:17,dir:'right',chat:'neha'},
  {id:'neha',name:'Neha',x:34,y:17,dir:'left',chat:'sam'},
  {id:'arjun',name:'Arjun',x:12,y:31,dir:'up'},
  {id:'courier',name:'Courier',x:44,y:33,dir:'left',mode:'wander',area:[38,31,12,6]},
  {id:'kiran',name:'Kiran',x:2,y:19,dir:'up',mode:'sit'},
  {id:'lena',name:'Lena',x:17,y:19,dir:'up',mode:'sit'},
  {id:'omar',name:'Omar',x:44,y:19,dir:'up',mode:'sit'},
  {id:'tess',name:'Tess',x:38,y:23,dir:'up',mode:'sit'},
  {id:'ravi',name:'Ravi',x:36,y:6,dir:'up',mode:'sit'},
  {id:'vik',name:'"Vik" (CoolAir)',x:5,y:17,dir:'up',levels:['access']},
  {id:'kabir',name:'Kabir',x:24,y:34,dir:'right',levels:['access']},
  {id:'zoe',name:'Zoe',x:15,y:33,dir:'down',levels:['access']},
];

/* ---------- outcome scale ---------- */
const OUT={safe:{pts:1,label:'Safe call',icon:'✓',col:'#22c55e'},acceptable:{pts:.6,label:'Not bad',icon:'~',col:'#65a30d'},false_alarm:{pts:.4,label:'False alarm',icon:'!',col:'#f59e0b'},compromise:{pts:0,label:'Compromised',icon:'✕',col:'#ef4444'}};

/* ---------- LEVELS ---------- */
const LEVELS=[
{id:'orientation',n:1,title:'Office Orientation',topic:'Physical red flags',minutes:6,
 blurb:'First day at NovaCorp. Meet the team and spot baiting, QR traps, exposed passwords and unlocked screens.',
 start:{x:36,y:38,dir:'up'},art:'usb',
 intro:["Welcome to NovaCorp. It's your first day.","Gold markers show where you're needed. If a goal is off-screen, follow the gold arrow at the edge.","Start by meeting Ada in the IT & Server Room."],
 tasks:[
  {id:'meet',label:'Meet Ada in IT',at:{npc:'ada'},talk:["Ah, the new intern. I'm Ada. I lead IT Security here.","Attackers rarely break through firewalls. They walk in through people.","Four red flags are hidden on this floor. Each one is glowing gold for you today.","Inspect each one, then decide what to do. Come back when you're done."]},
  {id:'usb',label:'USB drive in the cafeteria',at:{obj:'usb'},after:'meet',enc:{ch:'object',title:'A USB drive on the cafeteria floor',art:{sprite:'usb',desc:"A blue USB drive lies under a table. The label reads 'Salary_Revisions_2026'."},
    inspect:[{l:'Read the label',c:"'Salary_Revisions_2026': a label designed to make you curious.",f:1},{l:'Look around',c:"No one nearby is looking for it. It was left where lots of people pass.",f:1},{l:'Check for an asset tag',c:"No name, no IT asset sticker. Company drives always carry one.",f:1}],
    acts:[{l:'Plug it into your laptop to find the owner',o:'compromise',fb:"That's exactly what baiting relies on. A malicious drive can run code the moment it's connected."},{l:'Hand it to IT without plugging it in',o:'safe',fb:"IT can examine it safely on an isolated machine."},{l:'Leave it where it is',o:'acceptable',fb:"You didn't plug it in, but the next person might."},{l:"Drop it at reception's lost and found",o:'acceptable',fb:"Better than plugging it in, but unknown drives should go to IT."}],
    lesson:"Never plug in a drive you didn't get from IT. Curiosity is the attack."}},
  {id:'qr',label:'Free-lunch poster',at:{obj:'qr'},after:'meet',enc:{ch:'object',title:'A free-lunch poster with a QR code',art:{sprite:'qr',desc:"A bright poster on the cafeteria wall: 'FREE LUNCH TODAY! Scan to claim your voucher.'"},
    inspect:[{l:'Look at the QR code',c:"The code is a sticker, stuck slightly crooked on top of the printed poster.",f:1},{l:'Check who posted it',c:"No team name or contact. Cafeteria notices come from Facilities.",f:1},{l:'Preview the link',c:"Your camera preview shows nova-lunch-voucher.click/login. That's not a novacorp.com address.",f:1}],
    acts:[{l:'Scan it and sign in to claim lunch',o:'compromise',fb:"The page was a fake sign-in. Your password now belongs to someone else."},{l:'Report the poster to IT',o:'safe',fb:"IT and Facilities can take it down before others scan it."},{l:'Ignore it',o:'acceptable',fb:"You're safe, but colleagues may still fall for it."}],
    lesson:"A QR code is just a link you can't read. Treat it like any other link."}},
  {id:'sticky',label:'Note on a monitor',at:{obj:'stickyDesk'},after:'meet',enc:{ch:'object',title:'A sticky note on a monitor',art:{sprite:'sticky',desc:"On a colleague's monitor: a yellow note reading 'VPN: Summer2026!'. The desk is empty."},
    inspect:[{l:'Read the note',c:"It's a live VPN password, visible to anyone walking past.",f:1},{l:'Check the screen',c:"The computer isn't locked either.",f:1}],
    acts:[{l:'Tell the owner and IT so the password gets changed',o:'safe',fb:"Exposed passwords need changing, not just hiding."},{l:"Leave it, it's not your desk",o:'acceptable',fb:"Not your fault, but the password stays exposed."},{l:'Try it to see if it still works',o:'compromise',fb:"Using someone else's credentials is a breach in itself."},{l:'Take a photo to remind them later',o:'compromise',fb:"Now the password is on your phone too."}],
    lesson:"Passwords belong in a password manager, never on paper or a screen edge."}},
  {id:'laptop',label:'Unlocked meeting-room laptop',at:{obj:'laptop'},after:'meet',enc:{ch:'object',title:'An unlocked laptop in the meeting room',art:{sprite:'laptop',desc:"A laptop on the meeting table, unlocked, with the Finance inbox open. The meeting ended twenty minutes ago."},
    inspect:[{l:'Look at the screen',c:"The Finance inbox is open. Anyone could read or send email as its owner.",f:1},{l:'Check the room',c:"Empty. People walk past the glass wall all the time.",f:1}],
    acts:[{l:'Lock the screen (Windows + L) and tell the owner',o:'safe',fb:"Two seconds, and nobody can use that session."},{l:'Close the lid and leave it',o:'acceptable',fb:"Some laptops don't lock on close. Locking is safer."},{l:'Read the emails to find out whose it is',o:'compromise',fb:"That's reading confidential data you have no right to see."},{l:'Carry it to IT',o:'acceptable',fb:"Well meant, but locking it and telling the owner is quicker and safer."}],
    lesson:"Lock your screen every time you stand up: Windows + L, or Ctrl + Cmd + Q on a Mac."}},
 ]},
{id:'inbox',n:2,title:'Inbox Defense',topic:'Email phishing',minutes:8,
 blurb:'Six messages need your decision. Spot lookalike domains, fake logins and poisoned attachments, and trust the real ones.',
 start:{x:28,y:23,dir:'up'},art:'mail',
 intro:["Monday, 10:05 AM. Your inbox has filled up overnight.","Process each email at your desk. Inspect before you decide: check the sender, hover over links, look at attachments.","Some of these are real. Reporting a genuine email costs time too."],
 tasks:[
  {id:'e1',label:'Password expiry email',at:{obj:'myDesk'},enc:{ch:'email',title:'Action required: your password expires in 24 hours',
    art:{from:'IT Security',addr:'it-security@novac0rp-support.com',av:'#dc2626',time:'9:14 AM',subj:'Action required: your password expires in 24 hours',body:["Hi,","Your NovaCorp password will expire in 24 hours. To keep your current password and avoid losing access to email and files, confirm it now.","{link}","If you do not act, your account will be locked.","IT Security Team"],link:{t:'Keep my current password',h:'http://novac0rp-support.com/keep-password'}},
    inspect:[{l:'Check the sender',c:"novac0rp-support.com has a zero instead of an 'o', and it isn't novacorp.com.",f:1,hl:'addr'},{l:'Hover over the link',c:"It goes to novac0rp-support.com, not the company intranet.",f:1,hl:'link'},{l:'Read it carefully',c:"A 24-hour deadline and a threat of being locked out. Pressure is the oldest trick.",f:1,hl:'body'}],
    acts:[{l:'Click the link and sign in',o:'compromise',fb:"You just typed your password into an attacker's page."},{l:'Report it with the Report Phish button',o:'safe',fb:"Reported. IT can now block it for everyone."},{l:'Delete it',o:'acceptable',fb:"You're safe, but reporting protects colleagues too."},{l:'Reply and ask if it is real',o:'acceptable',fb:"The attacker reads replies and will say yes. Check through a channel you trust."}],
    lesson:"IT never asks you to confirm a password through an email link. Go to the intranet yourself."}},
  {id:'e2',label:'"Shared file" from NovaDrive',at:{obj:'myDesk'},enc:{ch:'email',title:"Priya shared 'Q4 Salary Revisions.xlsx' with you",
    art:{from:'Priya Sharma via NovaDrive',addr:'no-reply@novadrive-share.co',av:'#7c3aed',time:'9:31 AM',subj:"Priya shared 'Q4 Salary Revisions.xlsx' with you",body:["Priya Sharma has shared a file with you.","Q4 Salary Revisions.xlsx: 'Please review before Friday. Keep this confidential.'","{link}","NovaDrive · secure file sharing"],link:{t:'Open in NovaDrive',h:'https://novadrive-share.co/login?next=salary'}},
    inspect:[{l:'Check the sender',c:"novadrive-share.co isn't NovaCorp's file service. Real shares come from drive.novacorp.com.",f:1,hl:'addr'},{l:'Hover over the link',c:"It opens a sign-in page on novadrive-share.co.",f:1,hl:'link'},{l:'Think about the context',c:"Why would HR send salary data to a new intern? The juicy title is the bait.",f:1,hl:'body'}],
    acts:[{l:'Open it and sign in to view',o:'compromise',fb:"A fake sign-in page just captured your credentials."},{l:'Report it',o:'safe',fb:"Right call. IT will warn anyone else who received it."},{l:'Ask Priya on NovaChat if she sent it',o:'safe',fb:"Checking through a separate, trusted channel is exactly right."},{l:'Ignore it',o:'acceptable',fb:"Safe for you, but a report would protect others."}],
    lesson:"Unexpected 'shared file' emails are a favourite phishing format. Check the domain before you sign in anywhere."}},
  {id:'e3',label:'Maintenance notice from Dev',at:{obj:'myDesk'},enc:{ch:'email',title:'Planned maintenance Saturday 10 PM',legit:1,
    art:{from:'Dev Patel',addr:'dev@novacorp.com',av:'#16a34a',time:'9:40 AM',subj:'Planned maintenance Saturday 10 PM',body:["Hi all,","The VPN and email will be offline this Saturday from 10 PM to midnight for upgrades.","No action is needed. Please save your work before you log off on Friday.","Thanks, Dev (IT Helpdesk, ext. 4357)"]},
    inspect:[{l:'Check the sender',c:"dev@novacorp.com matches the IT Helpdesk entry in the company directory.",f:0,hl:'addr'},{l:'Look for links and attachments',c:"None. It asks you for nothing.",f:0,hl:'body'},{l:'Read it carefully',c:"No pressure and no request for passwords. It's purely informational.",f:0,hl:'body'}],
    acts:[{l:'Note it and carry on',o:'safe',fb:"Correct. This one is genuine."},{l:'Report it as phishing',o:'false_alarm',fb:"This one was real. Over-reporting costs IT time, so check the sender and the request first."},{l:'Forward it to your whole team',o:'acceptable',fb:"Harmless, but it already went to everyone."}],
    lesson:"Not every email is a threat. A known sender, no links and no request for credentials is a good sign."}},
  {id:'e4',label:'Overdue invoice',at:{obj:'myDesk'},enc:{ch:'email',title:'OVERDUE: Invoice #4471 payment failed',
    art:{from:'Accounts Receivable',addr:'billing@acme-supp1ies.com',av:'#ea580c',time:'10:02 AM',subj:'OVERDUE: Invoice #4471 payment failed',body:["Dear customer,","Our records show invoice #4471 is overdue. Please open the attached invoice and confirm your payment details today to avoid late fees.","Regards, Acme Supplies Billing"],attach:{n:'Invoice_4471.html',s:'14 KB'}},
    inspect:[{l:'Check the sender',c:"acme-supp1ies.com uses the number 1 instead of the letter l.",f:1,hl:'addr'},{l:'Check the attachment',c:"An .html file posing as an invoice. Opening it shows a fake login page.",f:1,hl:'attach'},{l:'Think about the context',c:"You're an intern. You don't handle vendor invoices, and NovaCorp doesn't use Acme.",f:1,hl:'body'}],
    acts:[{l:'Open the invoice',o:'compromise',fb:"The 'invoice' was a credential-harvesting page."},{l:'Report it',o:'safe',fb:"Good. Invoice lures are one of the most common phishing types."},{l:'Forward it to Finance to deal with',o:'compromise',fb:"You've just sent the trap to the people with payment access."},{l:'Delete it',o:'acceptable',fb:"Safe, but reporting helps IT block the sender."}],
    lesson:"Invoices arrive as PDFs from known vendors. An .html attachment is a red flag on its own."}},
  {id:'e5',label:'Onboarding email from HR',at:{obj:'myDesk'},enc:{ch:'email',title:'Welcome to NovaCorp! Your onboarding checklist',legit:1,
    art:{from:'Priya Sharma',addr:'priya@novacorp.com',av:'#7c3aed',time:'10:10 AM',subj:'Welcome to NovaCorp! Your onboarding checklist',body:["Hi and welcome!","Your onboarding checklist is on the HR portal. Please complete it by the end of your first week.","{link}","Priya, People & HR"],link:{t:'Open the HR portal',h:'https://hr.novacorp.com/onboarding'}},
    inspect:[{l:'Check the sender',c:"priya@novacorp.com, the real HR address.",f:0,hl:'addr'},{l:'Hover over the link',c:"hr.novacorp.com/onboarding: the company's own HR portal.",f:0,hl:'link'},{l:'Read it carefully',c:"No threats, a reasonable deadline, and it matches what Mira told you.",f:0,hl:'body'}],
    acts:[{l:'Open the HR portal',o:'safe',fb:"Correct. Genuine email, genuine portal."},{l:'Report it as phishing',o:'false_alarm',fb:"This was legitimate. Being too suspicious slows everyone down."},{l:'Ignore it',o:'acceptable',fb:"No risk, but you'd miss your onboarding tasks."}],
    lesson:"Verify, then act. When the sender, link and request all check out, it's fine to proceed."}},
  {id:'e6',label:'Rex needs a favour',at:{npc:'rex'},enc:{ch:'person',title:'Rex wants you to open an attachment',
    art:{npc:'rex',lines:["Hey! Can you open this attachment for me? It's a contract from some vendor.","It won't open on my laptop. Something about 'enable macros'. Maybe yours will work?"]},
    inspect:[{l:'Ask where it came from',c:"'Some vendor,' says Rex. 'Never heard of them, but the subject says URGENT.'",f:1,hl:'body'},{l:'Look at the file name',c:"Contract_Final.docm: a macro-enabled Word document.",f:1,hl:'body'}],
    acts:[{l:'Open it on your laptop and enable macros',o:'compromise',fb:"Macros in unexpected documents are a classic way to install malware."},{l:'Tell Rex not to enable macros and to report it',o:'safe',fb:"Rex grumbles, but he reports it. Crisis avoided."},{l:"Say you're busy",o:'acceptable',fb:"Rex will just ask someone else."}],
    lesson:"Never enable macros in a document you weren't expecting."}},
 ]},
{id:'signals',n:3,title:'Calls & Messages',topic:'Phone, SMS & MFA',minutes:8,
 blurb:'Vishing calls, smishing texts, MFA-fatigue attacks and a fake CFO on WhatsApp. One request is genuine.',
 start:{x:28,y:23,dir:'up'},art:'phone',
 intro:["Tuesday. Attackers know email filters are getting better, so today they'll call and text instead.","Your desk phone and your mobile will light up around the office. Each one is marked in gold.","Remember: a caller ID or a profile picture proves nothing."],
 tasks:[
  {id:'c1',label:'Call from "IT Support"',at:{obj:'myDesk'},enc:{ch:'call',title:'Incoming call from "IT Support"',
    art:{caller:'IT Support',num:'+91 80 4719 2231 · External',lines:["Hi, this is Arun from NovaCorp IT. We're seeing suspicious sign-ins on your account.","I'm sending a code to your phone. Read it back to me and I'll lock the attacker out.","Quickly please, they're still logged in!"]},
    inspect:[{l:'Check the caller ID',c:"An external number, not the internal helpdesk on extension 4357.",f:1,hl:'addr'},{l:'Ask for a ticket number',c:"'There's no time for a ticket!' He dodges the question.",f:1,hl:'body'},{l:'Think about the request',c:"A one-time code proves you are you. Anyone asking for it wants to log in as you.",f:1,hl:'body'}],
    acts:[{l:'Read the code out to him',o:'compromise',fb:"He just used your code to sign in to your account."},{l:'Hang up and call the helpdesk on 4357',o:'safe',fb:"Dev confirms nobody from IT called you. Reported."},{l:'Ask him to email you instead',o:'acceptable',fb:"He'll just send a phishing email. Calling the helpdesk yourself is safest."}],
    lesson:"Never share a one-time code. Not with IT, not with your bank, not with anyone."}},
  {id:'c2',label:'Text in the cafeteria',at:{obj:'phoneCafe'},enc:{ch:'sms',title:'A text about a parcel',
    art:{from:'NovaPost',num:'+91 74811 20937',text:"NovaPost: your parcel is on hold due to an unpaid customs fee of ₹49. Pay within 12 hrs or it will be returned:",link:'novapost-delivery.top/pay'},
    inspect:[{l:'Check the sender',c:"A random mobile number, not a courier's short code.",f:1,hl:'addr'},{l:'Look at the link',c:"novapost-delivery.top: a cheap domain unrelated to any real courier.",f:1,hl:'link'},{l:'Think about the context',c:"Are you even expecting a parcel? Tiny fees and tight deadlines are classic bait.",f:1,hl:'body'}],
    acts:[{l:'Pay the ₹49',o:'compromise',fb:"Your card details are now with scammers, and the fee was never the point."},{l:'Delete it and report it as spam',o:'safe',fb:"Good. Reporting helps carriers block the number."},{l:'Reply STOP',o:'acceptable',fb:"Replying confirms your number is active."}],
    lesson:"Couriers don't ask for fees by text link. Track parcels in the official app."}},
  {id:'c3',label:'Sign-in prompts on your phone',at:{obj:'phoneHR'},enc:{ch:'mfa',title:'Five sign-in requests in two minutes',
    art:{loc:'Moscow, RU',count:5},
    inspect:[{l:'Check the location',c:"Moscow. You're sitting in the Bengaluru office.",f:1,hl:'loc'},{l:'Did you start this?',c:"No. You haven't tried to sign in anywhere.",f:1,hl:'body'},{l:'Count the prompts',c:"Five prompts in two minutes. Someone is trying to wear you down.",f:1,hl:'body'}],
    acts:[{l:'Approve one to make them stop',o:'compromise',fb:"That approval let the attacker straight in. They already had your password."},{l:'Deny, report to IT and change your password',o:'safe',fb:"Exactly. The prompts mean your password is already out there."},{l:'Ignore them',o:'acceptable',fb:"Not approving is good, but IT needs to know your password leaked."}],
    lesson:"An MFA prompt you didn't start means someone has your password. Deny it and report it."}},
  {id:'c4',label:'Dev calls you over',at:{npc:'dev'},enc:{ch:'person',title:'Dev asks you to restart your laptop',legit:1,
    art:{npc:'dev',lines:["Hey, about your ticket #4471, the slow laptop.","I've pushed an update. Can you restart now? I'll watch it come back online from my side."]},
    inspect:[{l:'Check the ticket',c:"Ticket #4471 is yours. You raised it this morning.",f:0,hl:'body'},{l:"Check who's asking",c:"It's Dev, in person, at the helpdesk.",f:0,hl:'body'},{l:"What's being asked?",c:"Just a restart. No passwords, no codes.",f:0,hl:'body'}],
    acts:[{l:'Restart the laptop',o:'safe',fb:"Correct. A verified request that asks for nothing sensitive."},{l:'Refuse and report Dev to Security',o:'false_alarm',fb:"Dev is the real helpdesk, working on your own ticket."},{l:'Ask him to email the request first',o:'acceptable',fb:"Not wrong, but it was already verified in person."}],
    lesson:"Trust is fine when you've verified who is asking and what they want."}},
  {id:'c5',label:'WhatsApp from "Mr. Hale"',at:{obj:'phoneLobby'},enc:{ch:'chat',title:'WhatsApp from a new number',
    art:{app:'WhatsApp',wa:1,from:'R. Hale (CFO)',badge:'Not in contacts',msgs:["Hi, this is Hale. New number, my old phone broke.","I need a favour. Buy 5 Amazon gift cards of ₹10,000 for a client and send me the codes. I'll reimburse you today.","Keep this between us. It's very urgent."]},
    inspect:[{l:'Check the number',c:"It isn't in your contacts, and it isn't Hale's number in the directory.",f:1,hl:'addr'},{l:'Read the request',c:"Gift cards, secrecy and urgency together: the classic CEO-fraud recipe.",f:1,hl:'body'},{l:'Think about the process',c:"Real expenses go through the finance portal, never your personal card.",f:1,hl:'body'}],
    acts:[{l:'Buy the gift cards',o:'compromise',fb:"₹50,000 gone. Gift card codes are as good as cash."},{l:'Verify with Mr. Hale through a known channel',o:'safe',fb:"Hale is in his office and has no idea what you're talking about."},{l:'Ignore it',o:'acceptable',fb:"Safe for you, but Security should know someone is impersonating the CFO."},{l:'Reply asking who it really is',o:'acceptable',fb:"The scammer will just insist it's Hale."}],
    lesson:"A new number plus urgency plus secrecy is a scam until proven otherwise."}},
 ]},
{id:'access',n:4,title:'Access Control',topic:'Tailgating & pretexting',minutes:7,
 blurb:'Doors, badges and confident strangers. Decide who gets in, what gets shared and who simply needs directions.',
 start:{x:36,y:37,dir:'up'},art:'badge',
 intro:["Wednesday. Today the attackers come in person.","People with boxes, uniforms and confident stories. Some are exactly who they say they are.","Ask, verify, and when in doubt, send them to reception."],
 tasks:[
  {id:'a1',label:'Courier at the side door',at:{npc:'courier'},enc:{ch:'person',title:'A courier asks you to badge him in',
    art:{npc:'courier',lines:["Morning! Big delivery for the third floor.","My hands are full. Could you tap your badge on the side door and hold it for me? Reception is so slow."]},
    inspect:[{l:'Look for a visitor badge',c:"No visitor badge or sign-in sticker.",f:1,hl:'body'},{l:'Check the delivery',c:"The boxes have no NovaCorp label or delivery slip.",f:1,hl:'body'},{l:'Think about the request',c:"He's asking you to bypass reception, the one checkpoint for visitors.",f:1,hl:'body'}],
    acts:[{l:'Badge him in and hold the door',o:'compromise',fb:"Whoever he really is, he's now inside with no record of entry."},{l:'Point him to reception to sign in',o:'safe',fb:"Polite and firm. Reception handles every visitor."},{l:'Walk away without a word',o:'acceptable',fb:"He'll try the next person. Reception should know."}],
    lesson:"Never let anyone follow you through a secure door. Visitors sign in at reception."}},
  {id:'a2',label:'"Contractor" at the server room',at:{npc:'vik'},enc:{ch:'person',title:'A contractor wants the server room',
    art:{npc:'vik',lines:["Hi, I'm from CoolAir. Here to service the server-room AC.","Ada said it's fine, she's just busy. Can you let me in?"]},
    inspect:[{l:'Ask for a work ticket',c:"He has no ticket number and 'forgot' the paperwork.",f:1,hl:'body'},{l:'Check his ID',c:"A laminated card with no photo and a logo you don't recognise.",f:1,hl:'body'},{l:'Can you verify with Ada?',c:"Ada is right inside. Checking takes thirty seconds.",f:1,hl:'body'}],
    acts:[{l:'Let him into the server room',o:'compromise',fb:"Physical access to servers is the jackpot for an attacker."},{l:'Ask him to wait while you check with Ada',o:'safe',fb:"Ada has no AC service booked. Security escorts him out."},{l:'Tell him to come back tomorrow',o:'acceptable',fb:"He'll come back with a better story. Report it today."}],
    lesson:"Name-dropping is not authorisation. Verify with the person named."}},
  {id:'a3',label:'New hire needs directions',at:{npc:'kabir'},enc:{ch:'person',title:'A new hire asks for help',legit:1,
    art:{npc:'kabir',lines:["Hi! I'm Kabir, I start in Finance today.","Mira signed me in and gave me my badge. Could you point me to the HR room for my induction?"]},
    inspect:[{l:'Check his badge',c:"A proper NovaCorp badge with his photo and today's date.",f:0,hl:'body'},{l:'Ask Mira',c:"Mira nods: 'Yes, Kabir's on my list. Welcome!'",f:0,hl:'body'},{l:"What's being asked?",c:"Directions to HR. No access to anything sensitive.",f:0,hl:'body'}],
    acts:[{l:'Show him the way to HR',o:'safe',fb:"A verified colleague, a harmless request. Being helpful is part of security culture."},{l:'Call Security on him',o:'false_alarm',fb:"He was signed in and badged. That's a wasted call."},{l:'Refuse to help',o:'false_alarm',fb:"Being unhelpful to a verified colleague isn't security."}],
    lesson:"Security isn't suspicion of everyone. Verify, then help."}},
  {id:'a4',label:'Confidential printout',at:{obj:'printer'},enc:{ch:'object',title:'A confidential printout left in the tray',art:{sprite:'printer',desc:"A stack of pages titled 'Q3 salary bands: CONFIDENTIAL'. Nobody has collected it for an hour."},
    inspect:[{l:'Read the header',c:"Salary data for every team.",f:1},{l:'Check the cover sheet',c:"Printed by Priya in HR, an hour ago.",f:1},{l:'Look around',c:"The printer sits in a busy corridor next to the water cooler.",f:1}],
    acts:[{l:'Take it straight to Priya in HR',o:'safe',fb:"Priya thanks you and switches to secure print."},{l:'Leave it there',o:'acceptable',fb:"Anyone could pick it up."},{l:'Read through it',o:'compromise',fb:"You've just seen everyone's salary. That's a data leak in itself."},{l:'Throw it in the bin',o:'compromise',fb:"Bins aren't shredders. People do go through office rubbish."}],
    lesson:"Use secure print, collect printouts straight away, and shred what you don't need."}},
  {id:'a5',label:'"Auditor" in the cafeteria',at:{npc:'zoe'},enc:{ch:'person',title:'A visitor asks network questions',
    art:{npc:'zoe',lines:["Hi! I'm Zoe from NetSecure, doing a quick network audit for your IT team.","What's the office WiFi password, and which VPN app do you use? Just ticking boxes."]},
    inspect:[{l:'Check her badge',c:"A visitor badge, but it says 'Catering'.",f:1,hl:'body'},{l:'Check with IT',c:"No audit is on the IT calendar today.",f:1,hl:'body'},{l:'Think about the questions',c:"WiFi passwords and VPN details help an attacker get inside the network.",f:1,hl:'body'}],
    acts:[{l:'Share the details, it sounds official',o:'compromise',fb:"Pretexting works because it sounds routine."},{l:"Say you can't share that, and alert IT",o:'safe',fb:"IT has never heard of NetSecure. Good catch."},{l:'Send her to reception for the guest WiFi',o:'acceptable',fb:"Better than sharing, but the fake audit should be reported."}],
    lesson:"Real auditors go through IT, never through random employees in the cafeteria."}},
 ]},
{id:'executive',n:5,title:'Executive Floor',topic:'Business email compromise',minutes:10,
 blurb:'The boss level. A multi-stage CEO fraud through email, chat and a cloned voice, plus a vendor bank switch and one genuine payment.',
 start:{x:24,y:12,dir:'up'},art:'boss',
 intro:["Friday. You're covering for Mr. Hale's assistant on the executive floor.","Someone is about to try to move ₹18.5 lakh out of the company. It will look like it comes from the very top.","The CEO fraud happens in stages. Each stage unlocks the next."],
 tasks:[
  {id:'b1',label:'Stage 1: urgent email from the CEO',at:{obj:'execDesk'},enc:{ch:'email',title:'Confidential: urgent wire before 4 PM',
    art:{from:'Elena Vance (CEO)',addr:'elena.vance@novacorp-exec.com',av:'#0f766e',time:'2:41 PM',subj:'Confidential: urgent wire before 4 PM',body:["Hi,","We're closing a confidential acquisition today. I need you to wire ₹18,50,000 to our new legal partner before 4 PM.","Account: 50200081472219 · IFSC: HDFC0004471 · Larkspur Legal LLP","Do not discuss this with anyone, including Finance. I'm in meetings all day, so email only.","Elena"]},
    inspect:[{l:'Check the sender',c:"novacorp-exec.com is not novacorp.com. Anyone can register a lookalike domain.",f:1,hl:'addr'},{l:'Read it carefully',c:"Secrecy, a hard deadline and 'don't tell Finance'. Every pressure lever at once.",f:1,hl:'body'},{l:'Check the process',c:"Payments over ₹1 lakh need CFO approval in the finance portal. This skips it.",f:1,hl:'body'}],
    acts:[{l:'Send the wire',o:'compromise',fb:"₹18.5 lakh is gone, and banks rarely recover BEC losses."},{l:'Verify with Mr. Hale in the finance portal',o:'safe',fb:"There is no such request in the portal. You've stopped stage one."},{l:'Reply and ask if it is really her',o:'acceptable',fb:"The attacker controls that inbox and will say yes."},{l:'Forward it to Finance to pay',o:'compromise',fb:"You've passed the fraud to the people who can actually send money."}],
    lesson:"Any payment request that bypasses the normal approval process is a red flag, whoever it claims to come from."}},
  {id:'b2',label:'Stage 2: chat pressure',at:{obj:'execDesk'},after:'b1',enc:{ch:'chat',title:'NovaChat message from "Elena Vance"',
    art:{app:'NovaChat',from:'Elena Vance',badge:'External',msgs:["Did you see my email? This can't wait.","The board is watching this deal. I'll remember who helped today.","Just send it, then send me the receipt."]},
    inspect:[{l:'Look at the account label',c:"'External': this account is outside the NovaCorp workspace.",f:1,hl:'addr'},{l:'Read the tone',c:"Flattery plus pressure: 'I'll remember who helped today.'",f:1,hl:'body'},{l:'Cross-check her calendar',c:"Elena's calendar shows her on a flight right now.",f:1,hl:'body'}],
    acts:[{l:'Send the wire to make the pressure stop',o:'compromise',fb:"Pressure is the attacker's main tool. It worked."},{l:'Report the account to IT Security',o:'safe',fb:"IT blocks the external account and alerts the leadership team."},{l:'Mute the chat',o:'acceptable',fb:"You resisted, but Security needs to know."}],
    lesson:"Attackers switch channels to add pressure. A second channel is not a second proof."}},
  {id:'b3',label:'Stage 3: a call from "the CEO"',at:{obj:'meeting'},after:'b2',enc:{ch:'call',title:'Conference phone: "Elena Vance"',
    art:{caller:'Elena Vance',num:'+44 20 7946 0123 · Unknown',lines:["It's Elena. I'm about to board. Listen, the wire has to go now.","I know it's unusual. I'm authorising it personally. Do it and I'll sort out the paperwork later."]},
    inspect:[{l:'Check the number',c:"A UK number. Elena's mobile is in the directory, and it isn't this one.",f:1,hl:'addr'},{l:'Listen closely',c:"The voice sounds slightly flat, with odd pauses. Voices can be cloned from public videos.",f:1,hl:'body'},{l:'Ask a verification question',c:"You ask about this morning's all-hands. 'No time for this!' She dodges.",f:1,hl:'body'}],
    acts:[{l:'Send the wire, she authorised it',o:'compromise',fb:"A cloned voice is still a fraud. The money is gone."},{l:"Hang up and call Elena's directory number",o:'safe',fb:"The real Elena is boarding a plane, horrified. You stopped all three stages."},{l:"Tell her you'll do it after lunch",o:'acceptable',fb:"You bought time, but you should hang up and verify now."}],
    lesson:"Hang up and call back on a number you already trust. Voices and faces can be faked."}},
  {id:'b4',label:'Payment request from Mr. Hale',at:{npc:'hale'},enc:{ch:'person',title:'Mr. Hale asks you to check a payment',legit:1,
    art:{npc:'hale',lines:["Ah, good, you're here.","I've raised payment request FIN-2291 for our cleaning vendor in the finance portal. It's approved on my side.","Could you mark it as checked? Same vendor as every month."]},
    inspect:[{l:'Check the request',c:"FIN-2291 is in the finance portal with Hale's approval attached.",f:0,hl:'body'},{l:'Check the vendor',c:"BrightClean, paid monthly for two years, to the same bank account as always.",f:0,hl:'body'},{l:"Check who's asking",c:"Mr. Hale, in person, using the normal process.",f:0,hl:'body'}],
    acts:[{l:'Mark it as checked in the portal',o:'safe',fb:"Correct. Right person, right process, known vendor."},{l:'Refuse and report it as fraud',o:'false_alarm',fb:"This was the proper process. Not everything urgent is fraud."},{l:'Ask him to email you first',o:'acceptable',fb:"Harmless, but he's already using the proper channel."}],
    lesson:"Real requests follow the process. That's what makes fakes easy to spot."}},
  {id:'b5',label:'Vendor bank-detail change',at:{obj:'myDesk'},enc:{ch:'email',title:'Updated bank details for future payments',
    art:{from:'Ramesh (BrightClean Accounts)',addr:'accounts@brightclean-services.in',av:'#0284c7',time:'3:05 PM',subj:'Updated bank details for future payments',body:["Dear NovaCorp team,","Due to an audit, our bank account has changed. Please update our details before your next payment run.","New account: 9182 7346 1100 · IFSC: ICIC0008812","Kindly confirm once updated. Regards, Ramesh"]},
    inspect:[{l:'Check the sender',c:"brightclean-services.in, but BrightClean always writes from brightclean.in.",f:1,hl:'addr'},{l:'Check the request',c:"It changes where money goes, right before a payment run.",f:1,hl:'body'},{l:'Check the process',c:"Vendor bank changes must be confirmed by phone, on the number in the contract.",f:1,hl:'body'}],
    acts:[{l:'Update the bank details',o:'compromise',fb:"Next month's payment goes straight to the attacker."},{l:'Call BrightClean on the number in the contract',o:'safe',fb:"BrightClean's bank details haven't changed. Fraud stopped."},{l:'Reply to the email to confirm',o:'acceptable',fb:"Replying reaches the attacker, who will happily confirm."},{l:'Forward it to Finance to check',o:'acceptable',fb:"Better than acting on it, but you could have verified it yourself."}],
    lesson:"Always confirm bank-detail changes by phone, using contact details you already had."}},
 ]},
];
const levelById=id=>LEVELS.find(l=>l.id===id);
const scoredTasks=lv=>lv.tasks.filter(t=>t.enc);
