// ====== 定数 ======
const BOARD_WIDTH = 4; const BOARD_HEIGHT = 5; const GRID_SIZE = 80; const EXIT_X = 1; const EXIT_Y = 3;
const RECORDS_KEY = 'hakoinimusu_records_v1';
const STATE_KEY   = 'hakoinimusu_state_v1'; // 盤面の継続保存用

// ====== 要素参照 ======
const gameContainer = document.getElementById('game-container');
const moveCountSpan = document.getElementById('move-count');
const clearMessage = document.getElementById('clear-message');
const resetButton = document.getElementById('reset-button');
const rankOverlay = document.getElementById('rank-overlay');
const rankModal = document.getElementById('rank-modal');
const rankClose = document.getElementById('rank-close');
const rankList = document.getElementById('rank-list');
const rankClear = document.getElementById('rank-clear');
const rankFab = document.getElementById('rank-fab');

// ====== 状態 ======
let pieces = []; let moveCount = 0; let grid = [];
let currentPath = []; // スナップショット配列（初期含む）
let isReplaying = false; let replayTimer = null;

// ====== 初期配置 ======
const initialPiecesData = [
  { id: 'musume', x: 1, y: 0, w: 2, h: 2, name: '娘' },
  { id: 'father', x: 0, y: 0, w: 1, h: 2, class: 'large-vertical', name: '父親' },
  { id: 'mother', x: 3, y: 0, w: 1, h: 2, class: 'large-vertical', name: '母親' },
  { id: 'sub1', x: 1, y: 2, w: 2, h: 1, class: 'large-horizontal', name: '番頭' },
  { id: 'small1', x: 0, y: 2, w: 1, h: 2, class: 'small', name: '祖父' },
  { id: 'small2', x: 3, y: 2, w: 1, h: 2, class: 'small', name: '祖母' },
  { id: 'small3', x: 0, y: 4, w: 1, h: 1, class: 'small', name: '猫' },
  { id: 'small4', x: 3, y: 4, w: 1, h: 1, class: 'small', name: '猫' },
  { id: 'small5', x: 1, y: 3, w: 1, h: 1, class: 'small', name: '猫' },
  { id: 'small6', x: 2, y: 3, w: 1, h: 1, class: 'small', name: '猫' },
];

// ====== 記録ユーティリティ ======
function loadRecords(){ try{ const raw=localStorage.getItem(RECORDS_KEY); return raw?JSON.parse(raw):[]; }catch(e){ return []; } }
function saveRecords(arr){ localStorage.setItem(RECORDS_KEY, JSON.stringify(arr)); }
function addRecord(moves, path){ const rec={ id:Date.now(), moves, date:new Date().toISOString(), path }; const arr=loadRecords(); arr.push(rec); arr.sort((a,b)=>a.moves-b.moves||a.date.localeCompare(b.date)); saveRecords(arr.slice(0,50)); }
function deleteRecord(id){ saveRecords(loadRecords().filter(r=>r.id!==id)); renderRanking(); }
function clearAllRecords(){ saveRecords([]); renderRanking(); }
function renderRanking(){ const arr=loadRecords(); if(arr.length===0){ rankList.innerHTML='<p style="margin:8px 4px; color:#6b7280;">記録はまだありません。</p>'; return;} rankList.innerHTML = arr.map(r=>`<div class="rank-row" data-id="${r.id}"><div class="moves">${r.moves} 手 <span style="color:#6b7280; font-size:12px;">(${new Date(r.date).toLocaleString()})</span></div><button class="play" data-id="${r.id}" aria-label="再生">▶ 再生</button><button class="del" data-id="${r.id}" aria-label="削除">×</button></div>`).join(''); }

// ====== 盤面状態の保存・復元 ======
function serializePieces(){
  return pieces.map(p=>({ id:p.id, x:p.x, y:p.y, w:p.w, h:p.h, name:p.name, class:p.class }));
}
function saveState(){
  try{ const state={ moveCount, pieces: serializePieces() }; localStorage.setItem(STATE_KEY, JSON.stringify(state)); }catch(e){}
}
function loadState(){
  try{
    const raw = localStorage.getItem(STATE_KEY); if(!raw) return null; const s = JSON.parse(raw);
    if(!s || !Array.isArray(s.pieces)) return null;
    const ids = s.pieces.map(p=>p.id).sort().join(',');
    const baseIds = initialPiecesData.map(p=>p.id).sort().join(',');
    if(ids !== baseIds) return null; // 異なる配置・バージョンの場合は無視
    return s;
  }catch(e){ return null; }
}
function clearSavedState(){ try{ localStorage.removeItem(STATE_KEY); }catch(e){} }

// ====== 初期化 ======
function initGame(fromReset=false){
  stopReplay();
  if(fromReset) clearSavedState();

  // 復元 or 初期化
  const loaded = fromReset ? null : loadState();
  const sourceData = loaded ? loaded.pieces : initialPiecesData;
  moveCount = loaded ? (loaded.moveCount||0) : 0;
  updateMoveCount();

  gameContainer.innerHTML='<div id="exit"></div>';
  pieces=[]; currentPath=[]; clearMessage.style.visibility='hidden';
  grid=Array(BOARD_HEIGHT).fill(null).map(()=>Array(BOARD_WIDTH).fill(null));

  sourceData.forEach(data=>{
    const el=document.createElement('div');
    el.id=data.id; el.className=`piece ${data.class||''}`; el.textContent=data.name;
    const piece={ element:el, id:data.id, x:data.x, y:data.y, w:data.w, h:data.h, name:data.name, class:data.class };
    pieces.push(piece); gameContainer.appendChild(el); updatePiecePosition(piece); addDragListeners(piece);
  });

  snapshot();
  if(!loaded) saveState();
}

// ====== 見た目更新・スナップショット ======
function updatePiecePosition(piece){ for(let r=0;r<BOARD_HEIGHT;r++){ for(let c=0;c<BOARD_WIDTH;c++){ if(grid[r][c]===piece) grid[r][c]=null; } } piece.element.style.left=`${piece.x*GRID_SIZE}px`; piece.element.style.top=`${piece.y*GRID_SIZE}px`; piece.element.style.width=`${piece.w*GRID_SIZE}px`; piece.element.style.height=`${piece.h*GRID_SIZE}px`; for(let r=0;r<piece.h;r++){ for(let c=0;c<piece.w;c++){ grid[piece.y+r][piece.x+c]=piece; } } }
function snapshot(){ const s=pieces.map(p=>({id:p.id,x:p.x,y:p.y,w:p.w,h:p.h,name:p.name,class:p.class})); currentPath.push(s); }
function updateMoveCount(){ moveCountSpan.textContent=moveCount; }

// ====== クリア判定 ======
function checkClear(){ const musume=pieces.find(p=>p.id==='musume'); if(musume.x===EXIT_X && musume.y===EXIT_Y){ clearMessage.style.visibility='visible'; addRecord(moveCount, currentPath); pieces.forEach(p=>{ const clone=p.element.cloneNode(true); p.element.parentNode.replaceChild(clone, p.element);}); } }

// ====== 入力 ======
function addDragListeners(piece){ let startX,startY; function onDragStart(e){ if(clearMessage.style.visibility==='visible'||isReplaying) return; e.preventDefault(); const ev=e.touches?e.touches[0]:e; startX=ev.clientX; startY=ev.clientY; window.addEventListener('mousemove',onDragMove); window.addEventListener('mouseup',onDragEnd); window.addEventListener('touchmove',onDragMove,{passive:false}); window.addEventListener('touchend',onDragEnd);} function onDragMove(e){} function onDragEnd(e){ const ev=e.changedTouches?e.changedTouches[0]:e; const diffX=ev.clientX-startX; const diffY=ev.clientY-startY; let dx=0,dy=0; if(Math.abs(diffX)>Math.abs(diffY)){ if(diffX>GRID_SIZE/2) dx=1; else if(diffX<-GRID_SIZE/2) dx=-1; } else { if(diffY>GRID_SIZE/2) dy=1; else if(diffY<-GRID_SIZE/2) dy=-1; } if(dx||dy) movePiece(piece,dx,dy); window.removeEventListener('mousemove',onDragMove); window.removeEventListener('mouseup',onDragEnd); window.removeEventListener('touchmove',onDragMove); window.removeEventListener('touchend',onDragEnd);} piece.element.addEventListener('mousedown',onDragStart); piece.element.addEventListener('touchstart',onDragStart,{passive:false}); }

// ====== ロジック ======
function movePiece(piece,dx,dy){ if(isReplaying) return; const newX=piece.x+dx, newY=piece.y+dy; if(canMoveTo(piece,newX,newY)){ piece.x=newX; piece.y=newY; updatePiecePosition(piece); moveCount++; updateMoveCount(); snapshot(); saveState(); checkClear(); } }
function canMoveTo(piece,newX,newY){ if(newX<0||newY<0||newX+piece.w>BOARD_WIDTH||newY+piece.h>BOARD_HEIGHT) return false; for(let r=0;r<piece.h;r++){ for(let c=0;c<piece.w;c++){ const tx=newX+c, ty=newY+r; const occ=grid[ty][tx]; if(occ && occ!==piece) return false; } } return true; }

// ====== 再生機能 ======
function stopReplay(){ isReplaying=false; if(replayTimer){ clearTimeout(replayTimer); replayTimer=null; } }
function startReplay(path){ if(!Array.isArray(path)||path.length===0) return; stopReplay(); isReplaying=true; clearMessage.style.visibility='hidden'; gameContainer.innerHTML='<div id="exit"></div>'; pieces=[]; grid=Array(BOARD_HEIGHT).fill(null).map(()=>Array(BOARD_WIDTH).fill(null)); function applySnapshot(snap){ if(pieces.length===0){ snap.forEach(d=>{ const el=document.createElement('div'); el.id=d.id; el.className=`piece ${d.class||''}`; el.textContent=d.name; const obj={element:el, id:d.id, x:d.x, y:d.y, w:d.w, h:d.h, name:d.name, class:d.class}; pieces.push(obj); gameContainer.appendChild(el); updatePiecePosition(obj); }); } else { snap.forEach(d=>{ const p=pieces.find(pp=>pp.id===d.id); if(p){ p.x=d.x; p.y=d.y; updatePiecePosition(p); } }); } }
  let i=0; applySnapshot(path[i++]);
  const step=()=>{ if(i>=path.length){ isReplaying=false; return; } applySnapshot(path[i++]); replayTimer=setTimeout(step, 320); };
  replayTimer=setTimeout(step, 350);
}

// ====== イベント ======
resetButton.addEventListener('click', ()=>initGame(true));
rankFab.addEventListener('click', ()=>{ renderRanking(); rankOverlay.classList.add('open'); rankModal.classList.add('open'); });
rankClose.addEventListener('click', ()=>{ rankOverlay.classList.remove('open'); rankModal.classList.remove('open'); });
rankOverlay.addEventListener('click', ()=>{ rankOverlay.classList.remove('open'); rankModal.classList.remove('open'); });
rankClear.addEventListener('click', ()=>{ if(confirm('ランキングを全て消去しますか？')) clearAllRecords(); });
rankList.addEventListener('click', (e)=>{ const idAttr=e.target.getAttribute('data-id'); if(!idAttr) return; const id=Number(idAttr); if(e.target.classList.contains('play')){ const rec=loadRecords().find(r=>r.id===id); if(rec) startReplay(rec.path); } else if(e.target.classList.contains('del')){ deleteRecord(id); } });

// ====== 簡易セルフテスト（コンソール出力のみ） ======
function selfTest(){
  try{
    const results = [];
    results.push(['pieceCount', pieces.length===10]);
    const m = pieces.find(p=>p.id==='musume');
    results.push(['musume2x2', !!m && m.w===2 && m.h===2]);
    results.push(['serialize10', serializePieces().length===10]);
    // save/load round trip（localStorageを一時退避）
    const bak = localStorage.getItem(STATE_KEY);
    localStorage.setItem(STATE_KEY, JSON.stringify({moveCount, pieces: serializePieces()}));
    results.push(['loadState', !!loadState()]);
    if(bak!==null) localStorage.setItem(STATE_KEY, bak); else localStorage.removeItem(STATE_KEY);
    console.log('[SELF-TEST]', results.map(([k,v])=>`${k}:${v?'ok':'NG'}`).join(' | '));
  }catch(e){ console.warn('[SELF-TEST] error', e); }
}

// 起動
initGame();
selfTest();