
/* ---------- Letter parsing (pure; unit-tested) ---------- */
const SOUNDS = {
  a:["a","ay","eh","hey","aye a"], b:["b","be","bee","bea","bae"], c:["c","see","sea","cee","si","she"],
  d:["d","dee","de","di"], e:["e","ee","ea"], f:["f","ef","eff","effe"], g:["g","gee","jee","ji","ge"],
  h:["h","aitch","age","ache","eich","hache"], i:["i","eye","ai","aye"], j:["j","jay","jae","jaye"],
  k:["k","kay","kaye","cay","que"], l:["l","el","elle","ell","al"], m:["m","em","emm"], n:["n","en","enn"],
  o:["o","oh","owe","ou"], p:["p","pee","pea","pe"], q:["q","queue","cue","kyu","cu"], r:["r","are","ar","arr","our"],
  s:["s","ess","es","esse"], t:["t","tea","tee","ti","te"], u:["u","you","yu","ewe","yoo"], v:["v","vee","ve","vi"],
  w:["w","doubleyou","double-u","dublu"], x:["x","ex","ecks","eggs"], y:["y","why","wye","why's"], z:["z","zee","zed","zea"]
};
/* Cloud mode (Mode E): Google is already biased toward letters, so only accept the standard letter names.
   No guessing from look-alike words ("all", "it", "and"...), which caused wrong letters like O -> L. */
const CLOUD_NAMES = { bee:"b", see:"c", sea:"c", dee:"d", ee:"e", ef:"f", eff:"f", gee:"g", aitch:"h", eye:"i", jay:"j",
  kay:"k", el:"l", ell:"l", em:"m", en:"n", oh:"o", pee:"p", cue:"q", queue:"q", are:"r", ess:"s", tee:"t", you:"u",
  vee:"v", ex:"x", why:"y", zee:"z", zed:"z" };
const TOKEN2LETTER = {};
for (const [L, arr] of Object.entries(SOUNDS)) for (const s of arr) if (!(s in TOKEN2LETTER)) TOKEN2LETTER[s] = L;
TOKEN2LETTER["aye"] = "i";

function norm(s){ return s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase(); }
function targetForms(word){ // "swiveled / swivelled" -> both; strip hyphens/spaces/accents
  return word.split("/").map(w => norm(w).replace(/[^a-z]/g,"")).filter(Boolean);
}
/* Tokens the recognizer writes that could mean more than one thing. First entry is the primary reading. */
const AMBIG = { in:["n","in"], an:["n","an"], inn:["n","in"], and:["n",""], end:["n"], um:["","m"], am:["m","am"],
                all:["l"], ole:["l"], it:["t","it"], at:["t","at"], ok:["k","ok"], okay:["k"], is:["s","is"], es:["s"] };
/* Returns {letters, merged, alts}: letters = primary reading; alts = other readings of ambiguous tokens;
   merged = a multi-letter word had to be split (recognizer may have auto-corrected the spelling). */
function parseLetters(transcript, target, opts={}){
  const forms = targetForms(target);
  // Google writes a run of spelled letters as an all-caps "acronym" (e.g. "ORS"): split it back into letters
  const expanded = String(transcript).replace(/\b[A-Z]{2,6}\b/g, m => m==="OK" ? m : m.split("").join(" "));
  const fixed = norm(expanded).replace(/\b(double ?u|double ?you)\b/g, " w ").replace(/\b(will you|dub ?ya)\b/g, " willyou ");
  let toks = fixed.replace(/[^a-z' -]/g," ").replace(/-/g," ").split(/\s+/).filter(Boolean);
  // drop the word itself said before/after the letters, as in a real bee
  const isWord = t => forms.includes(t.replace(/[^a-z]/g,""));
  if (toks.length > 1 && isWord(toks[0])) toks = toks.slice(1);
  if (toks.length > 1 && isWord(toks[toks.length-1])) toks = toks.slice(0,-1);
  const pieces = []; let merged = false; const ambiguous = []; const mergedWords = [];
  for (let i=0;i<toks.length;i++){
    const t = toks[i].replace(/'s$/,"").replace(/'/g,"");
    if (!t) continue;
    if ((t==="double"||t==="dubble") && i+1<toks.length){
      const nxt = toks[i+1].replace(/'/g,"");
      if (nxt==="you"||nxt==="u"||nxt==="yu"){ pieces.push(["w"]); i++; continue; }
      const L = TOKEN2LETTER[nxt] || (nxt.length===1?nxt:null);
      if (L){ pieces.push([L+L]); i++; continue; }
    }
    // "will you" is usually W, but sometimes it swallowed more letters ("w a v e r"): read it as W, and if that
    // doesn't give the right spelling, call it unclear rather than wrong
    if (opts.joined){ // cloud mode: letters, standard letter names, or a run of letters Google joined together
      if (t.length===1){ pieces.push([t]); continue; }
      if (CLOUD_NAMES[t]){ pieces.push([CLOUD_NAMES[t]]); continue; }
      // this speller's own word-for-a-letter (learned from the letter check or a grown-up's "Mark right"):
      // read it as that letter first, but keep the raw reading too
      if (opts.map && opts.map[t]){ pieces.push([opts.map[t], t, ...nameVariants(t)]); continue; }
      if (["hyphen","dash","space","capital","uppercase","uh","um","er"].includes(t)) continue;
      // Google sometimes writes a letter as its name inside a joined run ("younwavering" for U-N-W...):
      // keep the raw reading first, plus readings with letter names swapped back to letters
      merged = true; pieces.push([t, ...nameVariants(t)]); continue;
    }
    if (opts.map && opts.map[t]){ pieces.push([opts.map[t], t]); continue; }   // this speller's learned word-for-a-letter
    if (t==="willyou"){ pieces.push(["w"]); mergedWords.push("will you"); continue; }
    if (["hyphen","dash","space","capital","uppercase","uh","er"].includes(t)) continue;
    if (t.length===1){ pieces.push([t]); continue; }
    if (AMBIG[t]){ pieces.push(AMBIG[t]); ambiguous.push(t); continue; }
    if (TOKEN2LETTER[t]){ pieces.push([TOKEN2LETTER[t]]); continue; }
    // recognizer joined letters into a word (e.g. "tiptoe") — split it, flag lower confidence
    // in cloud mode Google's letter-sequence class joins spelled letters on purpose ("s c a" -> "sca"): not a word guess
    merged = true; if (!opts.joined) mergedWords.push(t); pieces.push([t]);
  }
  const letters = pieces.map(p=>p[0]).join("");
  let combos = [""];
  for (const p of pieces){ const n=[]; for (const c of combos) for (const o of p){ if(n.length<256) n.push(c+o); } combos=n; }
  const alts = [...new Set(combos)].filter(c=>c!==letters);
  return {letters, merged, alts, ambiguous, mergedWords, cloud: !!opts.joined, pieces};
}
const NAME_SWAPS = [["you","u"],["why","y"],["are","r"],["see","c"],["bee","b"],["tee","t"],["tea","t"],["pee","p"],["jay","j"],
  ["kay","k"],["eye","i"],["oh","o"],["zee","z"],["dee","d"],["gee","g"],["vee","v"],["cue","q"],["ex","x"],["el","l"],["em","m"],["en","n"]];
function nameVariants(t){
  const out = new Set(); let frontier = [t];
  for (let round=0; round<3 && frontier.length; round++){
    const next = [];
    for (const s of frontier) for (const [name, L] of NAME_SWAPS){
      let i = s.indexOf(name);
      while (i !== -1 && out.size < 64){ const v = s.slice(0,i)+L+s.slice(i+name.length); if(!out.has(v) && v!==t){ out.add(v); next.push(v); } i = s.indexOf(name, i+1); }
    }
    frontier = next;
  }
  return [...out];
}
/* correct | unsure (only an ambiguous reading matches) | unclear (recognizer heard words, not letters) | wrong */
function isSubseq(a, b){ let i=0; for (const ch of b){ if (ch===a[i]) i++; } return i===a.length; }
function verdictFor(p, target, segCount=1){
  if (!p.letters) return "unclear"; // nothing heard
  if (isCorrect(p.letters, target)) return "correct";
  // cloud: a letter name inside a joined run (you->u, why->y...) is Google's formatting, not the kid's spelling
  if (p.cloud && p.alts.some(a=>isCorrect(a, target))) return "correct";
  if (p.alts.some(a=>isCorrect(a, target))) return "unsure";
  // listening restarted mid-word and letters are only missing (never wrong): likely lost in the restart gap
  if (segCount > 1 && p.letters.length < targetForms(target)[0].length && targetForms(target).some(f=>isSubseq(p.letters, f))) return "unclear";
  // recognizer turned letters into a real word ("a v e r i n g" -> "Angie"): a hearing problem, not a spelling miss
  if (p.mergedWords.length) return "unclear";
  return "wrong";
}
function isCorrect(letters, target){ return targetForms(target).includes(letters); }

/* Align heard vs target for letter-by-letter feedback (Levenshtein backtrace). */
function align(heard, target){
  const a=heard, b=targetForms(target)[0];
  const n=a.length, m=b.length, D=[...Array(n+1)].map(()=>Array(m+1).fill(0));
  for(let i=0;i<=n;i++)D[i][0]=i; for(let j=0;j<=m;j++)D[0][j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)D[i][j]=Math.min(D[i-1][j]+1,D[i][j-1]+1,D[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  const ops=[]; let i=n,j=m;
  while(i>0||j>0){
    if(i>0&&j>0&&D[i][j]===D[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){ops.push({ch:a[i-1],t:a[i-1]===b[j-1]?"m":"x",want:b[j-1]});i--;j--;}
    else if(i>0&&D[i][j]===D[i-1][j]+1){ops.push({ch:a[i-1],t:"x",want:""});i--;}
    else {ops.push({ch:"_",t:"gap",want:b[j-1]});j--;}
  }
  return ops.reverse();
}
/* Lenient check: does ANY combination of recognizer alternatives produce the target? (capped) */
function anyAltCorrect(segments, target){
  let combos=[""];
  for(const alts of segments){
    const next=[]; for(const c of combos) for(const a of alts){ next.push(c+" "+a); if(next.length>3000) break; }
    combos=next;
  }
  return combos.some(c=>isCorrect(parseLetters(c,target).letters,target));
}

/* ---------- Bee mode analysis (pure; unit-tested) ----------
   Two Google passes of the same clip: "plain" finds the spoken word and "start over"; "letters" gives the spelling.
   Word timestamps line them up: [word] letters [start over] letters ... [word = lock-in]. */
function tsec(t){ if (t==null) return null; if (typeof t==="number") return t; if (typeof t==="object") return (+t.seconds||0)+(+t.nanos||0)/1e9; const v=parseFloat(String(t)); return isNaN(v)?null:v; }
function wordsOf(results){
  const out=[];
  for (const r of results||[]){
    const a=(r.alternatives||[])[0]; if(!a) continue;
    // Google's JSON leaves out a time of exactly 0 (e.g. the first word's startTime), so a missing time inside "words" means 0
    if (a.words && a.words.length) for (const x of a.words) out.push({w:x.word, s:tsec(x.startTime ?? 0), e:tsec(x.endTime ?? 0)});
    else for (const t of (a.transcript||"").trim().split(/\s+/).filter(Boolean)) out.push({w:t, s:null, e:null});
  }
  return out;
}
function lev(a,b){ const m=a.length,n=b.length; if(!m) return n; if(!n) return m; let prev=[...Array(n+1).keys()];
  for(let i=1;i<=m;i++){ const cur=[i]; for(let j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); prev=cur; } return prev[n]; }
function clean(w){ return norm(String(w)).replace(/[^a-z]/g,""); }
/* where the bee word itself was spoken (fuzzy: it only has to be recognizable, pronunciation isn't scored) */
function findWordHits(words, target){
  const forms = targetForms(target), hits=[];
  for (let i=0;i<words.length;i++){
    for (let len=1; len<=Math.min(3,words.length-i); len++){
      const parts = words.slice(i,i+len).map(x=>clean(x.w));
      // a word split by Google ("scaff olding") may be joined, but never swallow single spelled letters
      if (len>1 && parts.some(x=>x.length<2)) break;
      const joined = parts.join("");
      if (joined.length < 2) continue;
      const ok = forms.some(f => { const tol = f.length<=4?0 : f.length<=7?1 : 2; return lev(joined,f)<=tol; });
      if (ok){ hits.push({i, j:i+len, s:words[i].s, e:words[i+len-1].e}); i += len-1; break; }
    }
  }
  return hits;
}
function findRestarts(words){
  const hits=[]; const t=words.map(x=>clean(x.w));
  for (let i=0;i<t.length;i++){
    if (t[i]==="restart" || t[i]==="startover"){ hits.push({i, j:i+1, s:words[i].s, e:words[i].e}); continue; }
    if (t[i]==="start"){ for (let k=i+1;k<=Math.min(i+2,t.length-1);k++) if (t[k]==="over"||t[k]==="again"){
      // swallow "can I / may I" before it
      let a=i; while (a>0 && i-a<2 && ["can","may","i","could"].includes(t[a-1])) a--;
      hits.push({i:a, j:k+1, s:words[a].s, e:words[k].e}); i=k; break; } }
  }
  return hits;
}
/* Google sometimes glues the spoken word onto the letters ("pleatspleats" = p-l-e-a-t-s + "pleats").
   Split such tokens back apart; the spoken-word piece gets a short slice of the token's time. */
function splitGlued(words, target){
  const forms = targetForms(target).filter(f=>f.length>=3), out=[];
  for (const x of words){
    let t = clean(x.w), s = x.s, e = x.e;
    const timed = s!=null && e!=null;
    const suf = [];
    // spoken word glued AFTER the letters; the leftover must be about word-length (the spelled letters),
    // so "younwavering" isn't split into "yo" + "unwavering"
    for (let guard=0; guard<3; guard++){
      const f = forms.find(f => t.endsWith(f) && t.length - f.length >= Math.max(2, f.length - 2));
      if (!f) break;
      const cut = timed ? e - Math.min(0.9, 0.4*(e-s)) : null;
      suf.unshift({w:f, s:cut, e}); t = t.slice(0, t.length - f.length); e = cut;
    }
    // spoken word glued BEFORE the letters ("tiptoetip" = "tiptoe" + t-i-p)
    let pre = null;
    const f2 = forms.find(f => t.startsWith(f) && t.length > f.length);
    if (f2){ const cut = timed ? s + Math.min(0.9, 0.4*(e-s)) : null; pre = {w:f2, s, e:cut}; t = t.slice(f2.length); s = cut; }
    if (!pre && !suf.length){ out.push(x); continue; }
    if (pre) out.push(pre);
    if (t) out.push({w:t, s, e});
    out.push(...suf);
  }
  return out;
}
/* lock-in check on the plain pass alone (used while still recording) */
function isLockedIn(plainWords, target){
  plainWords = splitGlued(plainWords, target);
  const hits = findWordHits(plainWords, target); if (!hits.length) return false;
  const last = hits[hits.length-1];
  const fillers = new Set(["um","uh","er","okay","ok"]);
  const after = plainWords.slice(last.j).filter(x=>!fillers.has(clean(x.w)));
  if (after.length) return false;
  const restarts = findRestarts(plainWords);
  const startIdx = (hits.length>1 && hits[0].i<=1) ? hits[0].j : 0;
  const lastRestart = restarts.filter(r=>r.j<=last.i).pop();
  const from = Math.max(startIdx, lastRestart ? lastRestart.j : 0);
  if ((last.i - from) >= 2) return true;   // some spelling between the opening (or last restart) and the closing word
  // or Google heard the spelled letters as the word itself: word, word, word
  return hits.length >= 3 && hits[0].i <= 1 && !(lastRestart && lastRestart.j > hits[hits.length-2].i);
}
/* full analysis once recording ends */
/* where things were said, from the plain pass: opening word, start-overs, closing (lock-in) word, and the spelling windows */
function beeStructure(plainResults, target, duration){
  const plain = splitGlued(wordsOf(plainResults), target);
  const hits = findWordHits(plain, target), restarts = findRestarts(plain);
  const opening = hits.length && hits[0].i <= 1 && !(hits.length===1 && hits[0].j>=plain.length && plain.length>2) ? hits[0] : null;
  const lastHit = hits.length ? hits[hits.length-1] : null;
  const fillers = new Set(["um","uh","er","okay","ok"]);
  const closing = lastHit && lastHit!==opening && plain.slice(lastHit.j).every(x=>fillers.has(clean(x.w))) ? lastHit : null;
  const timed = plain.length>0 && plain.every(x=>x.s!=null && x.e!=null);
  const windows = [];
  if (timed){
    const shortWord = 0.3 + 0.15 * (targetForms(target)[0]||"").length;   // longer than this = letters were glued into it
    let t0 = opening ? opening.e : 0;
    // Google sometimes stretches the opening "word" over the first letters ("tiptoe" covering "tiptoe t-i-p"):
    // then only treat its first part as the spoken word
    if (opening && opening.e - opening.s > shortWord) t0 = opening.s + Math.min(0.9, 0.4*(opening.e - opening.s));
    for (const r of restarts){
      if (r.s > t0 && (!closing || r.s < closing.s)){
        windows.push([t0, r.s]); t0 = r.e;
        // spellers often say the word again after "start over": skip it so it isn't read as letters
        // (but Google may also write the spelled letters as the word: only skip it if it's too short to be
        //  letters being spelled, about 0.3 s + 0.15 s per letter)
        const again = hits.find(hh => hh.i === r.j && hh !== closing);
        if (again && (again.e - again.s) < shortWord) t0 = again.e;
      }
    }
    windows.push([t0, closing ? closing.s : (duration || 1e9)]);
  }
  return { plain, opening, closing, restarts, timed, windows, plainText: plain.map(x=>x.w).join(" ") };
}
/* score the spelling attempts (one text per window; the last one is the answer) */
function scoreBee(attemptTexts, target, strict, st, notes, map){
  // after a start-over, the cut can catch the tail of "start over"; no bee word on the list starts with these
  attemptTexts = attemptTexts.map((a,k) => k===0 ? a : a.replace(/^\s*(?:(?:start|over|again|restart)\b\s*)+/i, "").replace(/^\s*(over|again)(?=[a-z]{2,})/i, ""));
  const parsed = attemptTexts.map(a => { const words = splitGlued(a.split(/\s+/).filter(Boolean).map(w=>({w, s:null, e:null})), target);
    return parseLetters(words.map(x=>x.w).join(" "), target, {joined:true, map}); });
  const finalP = parsed[parsed.length-1] || {letters:"", alts:[], mergedWords:[], cloud:true};
  let verdict = verdictFor(finalP, target);
  let finalLetters = finalP.letters;
  if (verdict==="correct" && !isCorrect(finalLetters, target)) finalLetters = finalP.alts.find(a=>isCorrect(a,target)) || finalLetters;
  // Scripps: after starting over, the letters already said can't change
  let violation = null;
  if (strict){
    for (let k=0;k+1<parsed.length;k++){
      const prev = parsed[k].letters, next = k+1===parsed.length-1 ? finalLetters : parsed[k+1].letters;
      if (prev && !next.startsWith(prev)){ violation = {before:prev, after:next}; break; }
    }
    if (violation && verdict==="correct") verdict = "wrong";
  }
  if (!st.opening && strict) notes.push("Remember to say the word before spelling it.");
  return { attempts: parsed.map(p=>p.letters), final: finalLetters, alts: finalP.alts || [], raw: attemptTexts[attemptTexts.length-1] || "", verdict, opening: !!st.opening, locked: !!st.closing,
           restarts: st.restarts.length, violation, notes, plainText: st.plainText, timed: st.timed };
}
/* preferred: letters transcribed separately for each window of audio (letterTexts[i] for st.windows[i]) */
function analyzeBeeWindows(st, letterTexts, target, strict, map){ return scoreBee(letterTexts, target, strict, st, [], map); }
/* fallback: one letter pass over the whole recording, split by word timestamps if Google gave them */
function analyzeBee(plainResults, letterResults, target, strict, map){
  const st = beeStructure(plainResults, target);
  const letters = splitGlued(wordsOf(letterResults), target);
  const notes = [];
  let attempts;
  if (st.timed && letters.length && letters.every(x=>x.s!=null)){
    attempts = st.windows.map(([a,b]) => letters.filter(x => { const mid=(x.s+x.e)/2; return mid>a && mid<b; }).map(x=>x.w).join(" "));
  } else {
    attempts = [letters.map(x=>x.w).join(" ")];
    if (st.restarts.length) notes.push("No timing from Google, so start-over couldn't be placed; scored the whole recording.");
  }
  return scoreBee(attempts, target, strict, st, notes, map);
}
/* ---------- Each speller's letter map (pure; unit-tested) ----------
   Learned two ways: the letter check (the speller reads A-Z) and a grown-up's "Mark right".
   tokens: a word Google writes for one of this speller's letters ("be" for B)  -> read it as that letter
   pairs:  a letter Google hears as a different letter for this speller ("l>o") -> a miss that differs only
           by these is held as "needs a check" in Practice instead of being marked wrong (Bee mode stays strict) */
// letters that sound alike for everyone (the "ee" letters, m/n, f/s, a/j/k)
const SOUND_ALIKE = ["bcdegptvz", "mn", "fs", "ajk"];
function soundsAlike(a, b){ return a !== b && SOUND_ALIKE.some(g => g.includes(a) && g.includes(b)); }
/* Line up what Google wrote (pieces: each an array of readings, first = main) with the letters that were said.
   ops: ok (matched), sub (one letter heard as another), token (a word heard for one letter), extra, miss */
function alignPieces(pieces, exp){
  const n = pieces.length, m = exp.length, INF = 1e9;
  const D = [...Array(n+1)].map(() => Array(m+1).fill(INF)), B = [...Array(n+1)].map(() => Array(m+1).fill(null));
  D[0][0] = 0;
  const relax = (i, j, c, op) => { if (c < D[i][j] - 1e-9){ D[i][j] = c; B[i][j] = op; } };
  for (let i=0;i<=n;i++) for (let j=0;j<=m;j++){
    const c = D[i][j]; if (c >= INF) continue;
    if (j < m) relax(i, j+1, c+1, {k:"miss", pi:i, pj:j, letters:exp[j]});
    if (i >= n) continue;
    const opts = [].concat(pieces[i]).filter(Boolean), main = opts[0] || "";
    relax(i+1, j, c+1, {k:"extra", pi:i, pj:j, piece:main});
    for (const o of opts) if (o && exp.startsWith(o, j)) relax(i+1, j+o.length, c, {k:"ok", pi:i, pj:j, piece:o, letters:o});
    if (j < m && main.length === 1 && main !== exp[j]) relax(i+1, j+1, c+1, {k:"sub", pi:i, pj:j, piece:main, letters:exp[j]});
    if (j < m && main.length >= 2 && main.length <= 6) relax(i+1, j+1, c+0.6, {k:"token", pi:i, pj:j, piece:main, letters:exp[j]});
  }
  const ops = []; let i = n, j = m;
  while (i > 0 || j > 0){
    const op = B[i][j]; if (!op) break;
    ops.push(op); i = op.pi; j = op.pj;
  }
  return ops.reverse();
}
/* Letter check: what Google heard for each letter of one chunk ("" = not caught) */
function alphaHeard(transcript, letters){
  const p = parseLetters(transcript, "", {joined:true});
  const heard = {}; for (const L of letters) heard[L] = "";
  for (const op of alignPieces(p.pieces, letters)){
    if (op.k === "ok") for (const L of op.letters) heard[L] = L;
    else if (op.k === "sub" || op.k === "token") heard[op.letters] = op.piece;
  }
  return heard;
}
/* Build the map from the letter check (profile.alpha.heard) and grown-up corrections in the attempts.
   From corrections, a word-for-a-letter is learned only when it was the ONLY thing that differed in the answer, and only
   after it shows up in two different corrected answers. (v1.10: before, one correction could teach a chunk like "lee",
   which was really L+E, as just E.) */
function kidLetterMap(alpha, attempts){
  const tokens = {}, clash = new Set(), pairs = new Set(), corr = {}, seen = {};
  const addTok = (t, L) => { if (clash.has(t)) return; if (tokens[t] && tokens[t] !== L){ delete tokens[t]; clash.add(t); } else tokens[t] = L; };
  for (const [L, h] of Object.entries((alpha && alpha.heard) || {})){
    if (!h || h === L) continue;
    if (h.length === 1) pairs.add(L + ">" + h); else addTok(h, L);
  }
  for (const a of attempts || []){
    // only spoken answers a grown-up marked right (typing mistakes aren't mishearings)
    if (a.x || !a.o || !a.ok || a.m === "type" || a.e === "b" || !a.w) continue;   // (e:"b" = the device's own recognizer, which mishears differently)
    const exp = targetForms(a.w)[0]; if (!exp) continue;
    const pieces = a.r ? parseLetters(a.r, a.w, {joined:true}).pieces : String(a.h || "").split("").map(c => [c]);
    const ops = alignPieces(pieces, exp), off = ops.filter(o => o.k !== "ok");
    if (!off.length || off.length > 3) continue;                    // nothing to learn, or too different to learn from safely
    if (off.some(o => o.k === "miss" || o.k === "extra")) continue; // letters lost or added: the chunk can't be lined up with one letter
    for (const o of off){
      if (o.k === "token"){ const k = o.piece + ">" + o.letters; (seen[k] = seen[k] || new Set()).add(a.id || a.t); if (seen[k].size >= 2) addTok(o.piece, o.letters); }
      // a letter-for-letter mix-up counts after two corrections (one lenient "Mark right" shouldn't change scoring)
      if (o.k === "sub"){ const k = o.letters + ">" + o.piece; corr[k] = (corr[k] || 0) + 1; if (corr[k] >= 2) pairs.add(k); }
    }
  }
  return { tokens, pairs };
}
/* Mix-ups a grown-up has already OK'd for this speller (v1.10).
   For every answer a grown-up decided (Mark right / Mark wrong / a "needs a check"), compare what was heard with the word.
   If they're the same length and differ in 1-2 letters that sound alike, count each pair (unordered, "m/n") as
   ok (grown-up said right) or bad (grown-up said wrong). Returns { "m/n": {ok, bad}, ... }. */
const pairKey = (x, y) => [x, y].sort().join("/");
function confirmedMixups(attempts){
  const c = {};
  for (const a of attempts || []){
    if (a.x || !a.o || a.m === "type" || a.e === "b" || !a.w) continue;
    const h = norm(String(a.h || "")).replace(/[^a-z]/g, "");
    for (const f of targetForms(a.w)){
      if (h.length !== f.length || h === f) continue;
      const diffs = []; for (let i = 0; i < f.length; i++) if (h[i] !== f[i]) diffs.push([f[i], h[i]]);
      if (diffs.length > 2 || !diffs.every(([x, y]) => soundsAlike(x, y))) continue;
      for (const [x, y] of diffs){ const k = pairKey(x, y); c[k] = c[k] || { ok:0, bad:0 }; if (a.ok) c[k].ok++; else c[k].bad++; }
      break;
    }
  }
  return c;
}
const AUTO_OK_MIN = 5;
/* Can this sound-alike miss be counted right without a grown-up? diffs = soundAlikeDiffs(...) = [{want, got, at}].
   Every pair must have >= 5 grown-up OKs and no "it was wrong", and the swapped letter can't sit next to its partner
   in the word (solemn, autumn, government: those are real spelling traps). */
function autoAcceptable(diffs, target, conf){
  if (!diffs || !diffs.length || !conf) return false;
  const forms = targetForms(target);
  return diffs.every(d => {
    const k = conf[pairKey(d.want, d.got)];
    if (!k || k.bad > 0 || k.ok < AUTO_OK_MIN) return false;
    const f = forms.find(f => f[d.at] === d.want) || forms[0];
    return f[d.at - 1] !== d.got && f[d.at + 1] !== d.got;
  });
}
/* Goofing around instead of spelling (v1.10): filler words ("yeah yeah yeah", "blah blah"), the same non-letter word 3+
   times, or 6+ more letters than the word has (the ABC song). Practice asks to try again instead of counting a miss. */
const FILLERS = new Set(["yeah","yea","yay","yep","yup","nope","blah","blahblah","boom","woo","woohoo","hehe","haha","hahaha","whatever","uhhuh"]);
function looksLikeGoofing(raw, target){
  const f = targetForms(target)[0] || "";
  const toks = norm(String(raw || "")).replace(/[^a-z' ]/g, " ").replace(/'/g, "").split(/\s+/).filter(Boolean);
  const letterish = t => t.length === 1 || CLOUD_NAMES[t] || TOKEN2LETTER[t] || AMBIG[t];
  if (toks.some(t => FILLERS.has(t) && !f.includes(t))) return true;
  const n = {}; for (const t of toks) if (t.length >= 2 && !letterish(t) && !f.includes(t)) n[t] = (n[t] || 0) + 1;
  if (Object.values(n).some(x => x >= 3)) return true;
  const letters = parseLetters(raw, target, { joined:true }).letters;
  return letters.length >= f.length + 6;
}
/* the same transcript with filler words taken out ("m o t h s yeah" -> "m o t h s"): if that spells the word, it counts */
function stripFillers(raw){
  return String(raw || "").split(/\s+/).filter(t => !FILLERS.has(norm(t).replace(/[^a-z]/g, ""))).join(" ").trim();
}
/* If a miss differs from the right spelling only by letters that sound alike (for everyone, or for this speller),
   return the differences [{want, got}]; otherwise null */
function soundAlikeDiffs(heard, target, pairs){
  for (const f of targetForms(target)){
    if (!heard || heard.length !== f.length || heard === f) continue;
    const diffs = [];
    for (let i=0;i<f.length;i++) if (heard[i] !== f[i]) diffs.push({ want:f[i], got:heard[i], at:i });
    if (diffs.length > 2) continue;
    if (diffs.every(d => soundsAlike(d.want, d.got) || (pairs && pairs.has(d.want + ">" + d.got)))) return diffs;
  }
  return null;
}
/* ---------- Spelling rules (pure; unit-tested) ----------
   Patterns that show up in the school list, written for kids. Each rule can
   - tag a word it applies to (for the rule card and "Practice a pattern")
   - spot a mistake that breaks it: cands(t) makes versions of the right spelling with that kind of mistake;
     if one of them is closer to what the speller wrote than the right spelling is, the rule explains (part of) the miss */
function subAll(t, re, wrongs){
  const out = []; const g = new RegExp(re.source, "g"); let m;
  while ((m = g.exec(t)) !== null){ for (const w of wrongs) out.push(t.slice(0, m.index) + w + t.slice(m.index + m[0].length)); if (!m[0].length) g.lastIndex++; }
  return out;
}
const RULES = [
  { id:"nodouble", name:"Letters that don't double",
    rule:"H, J, K, Q, V, W, X and Y almost never come in pairs. For a doubled K sound, use CK.",
    tag: w => /[vjx]/.test(w) || /(^|[^c])k/.test(w),
    cands: t => { const out = []; for (let i = 0; i < t.length; i++) if ("hjkqvwxy".includes(t[i]) && t[i+1] !== t[i] && t[i-1] !== t[i]) out.push(t.slice(0, i+1) + t[i] + t.slice(i+1));
                  return out.concat(subAll(t, /ck/, ["kk"])); },
    tip: (h) => { const m = h.match(/([hjkqvwxy])\1/); return m ? `${m[1].toUpperCase()} is almost never doubled.` : "Use CK, not KK."; } },
  { id:"ck", name:"CK after a short vowel",
    rule:"After a short vowel, the K sound is usually spelled CK (click, crackle, rickety).",
    tag: w => /ck/.test(w), cands: t => subAll(t, /ck/, ["k", "c", "kk", "cc"]) },
  { id:"qu", name:"Q and U go together",
    rule:"Q is always followed by U (quest, squeeze, harlequin).",
    tag: w => /q/.test(w), cands: t => subAll(t, /qu/, ["q", "kw", "cw"]) },
  { id:"softc", name:"Soft C",
    rule:"C before E, I or Y sounds like S (mercy, citizen, recess). If you hear S before E, I or Y, think about whether the word uses C.",
    tag: w => /c[eiy]/.test(w), cands: t => subAll(t, /c(?=[eiy])/, ["s", "ss"]).concat(subAll(t, /s(?=[eiy])/, ["c"])) },
  { id:"le", name:"Endings -LE, -EL, -AL",
    rule:"The “ul” sound at the end is usually -LE after a consonant (kibble, maple, griddle). Describing words often end in -AL (royal, abnormal).",
    tag: w => /[^aeiou]le[sd]?$|als?$|els?$/.test(w),
    cands: t => subAll(t, /le(?=[sd]?$)/, ["el", "al", "ul", "il"]).concat(subAll(t, /al(?=s?$)/, ["le", "el", "ul", "ol"]), subAll(t, /el(?=s?$)/, ["le", "al"])) },
  { id:"tion", name:"-TION and -SION",
    rule:"The “shun” sound is usually spelled -TION (narration, solution). -SION and -SSION are less common (mission, procession).",
    tag: w => /[st]ion/.test(w), cands: t => subAll(t, /tion/, ["sion", "shun", "cion", "shion", "ssion"]).concat(subAll(t, /s?sion/, ["tion", "shun", "shion"])) },
  { id:"ie", name:"IE and EI",
    rule:"IE is much more common than EI (achieve, shriek, view). Remember: I before E, except after C.",
    tag: w => /ie|ei/.test(w), cands: t => subAll(t, /ie/, ["ei", "ee", "ea"]).concat(subAll(t, /ei/, ["ie"])) },
  { id:"ed", name:"The -ED ending",
    rule:"Past-tense -ED stays -ED even when it sounds like T or D (scratched, borrowed, boasted).",
    tag: (w, e) => /[a-z]{3}ed$/.test(w) && (!e || /verb|adjective/.test(e.pos || "")),
    cands: t => /ed$/.test(t) ? [t.slice(0, -2) + "t", t.slice(0, -2) + "d", t.slice(0, -2) + "id", t.slice(0, -1)] : [] },
  { id:"y", name:"Y at the end",
    rule:"A long E sound at the end of a word is usually spelled Y (hurry, mercy, family).",
    tag: w => /[^aeo]y$/.test(w) && /[aeiou]/.test(w.slice(0, -1)), cands: t => /[^aeo]y$/.test(t) ? ["ee", "ey", "ie", "i", "e", "ea"].map(x => t.slice(0, -1) + x) : [] },
  { id:"double", name:"Short vowel, double consonant",
    rule:"After a short vowel, the next consonant is often doubled (tabby, pudding, kibble, litter).",
    tag: w => /([bdfglmnprstz])\1/.test(w),
    cands: t => { const out = []; for (let i = 0; i + 1 < t.length; i++) if (t[i] === t[i+1] && "bcdfglmnprstz".includes(t[i])) out.push(t.slice(0, i) + t.slice(i+1)); return out; } },
  { id:"silent", name:"Silent letters",
    rule:"Some letters are silent: KN (knelt), WR (wrong, wry), GH (ghost).",
    tag: w => /^kn|^wr|gh/.test(w), cands: t => subAll(t, /^kn/, ["n"]).concat(subAll(t, /^wr/, ["r"]), subAll(t, /gh/, ["g", ""])) },
  { id:"ous", name:"The -OUS ending",
    rule:"Describing words that end with an “us” sound are usually spelled -OUS (hilarious, courteous).",
    tag: w => /ous$/.test(w), cands: t => subAll(t, /ous$/, ["us", "os", "ouse"]) },
  { id:"ph", name:"PH spells F",
    rule:"PH can spell the F sound (phalanx, aphorism).",
    tag: w => /ph/.test(w), cands: t => subAll(t, /ph/, ["f", "ff"]) },
  { id:"x", name:"X spells KS",
    rule:"X spells a “ks” sound (relax, vexation, next).",
    tag: w => /.x/.test(w), cands: t => subAll(t, /x/, ["ks", "cks", "cs", "kz"]) },
];
/* rules that apply to a word (entry = words.js entry, for part of speech) */
function rulesFor(word, entry){ const t = targetForms(word)[0] || ""; return RULES.filter(r => r.tag(t, entry)); }
/* rules a wrong spelling breaks, with a tip for each */
function ruleMistakes(heard, word){
  const h = clean(heard || ""); if (!h) return [];
  const out = [];
  for (const t of targetForms(word)){
    if (h === t) return [];
    const base = lev(t, h);
    for (const r of RULES){
      if (out.some(o => o.id === r.id)) continue;
      if (r.cands(t).some(c => c !== t && lev(c, h) < base)) out.push({ id: r.id, name: r.name, tip: r.tip ? r.tip(h, t) : r.rule });
    }
    if (out.length) break;          // use the first spelling form that explains something
  }
  return out;
}
if (typeof module!=="undefined") module.exports={RULES,rulesFor,ruleMistakes,parseLetters,verdictFor,isSubseq,isCorrect,align,anyAltCorrect,targetForms,analyzeBee,analyzeBeeWindows,beeStructure,splitGlued,isLockedIn,findWordHits,findRestarts,wordsOf,scoreBee,alignPieces,alphaHeard,kidLetterMap,soundAlikeDiffs,soundsAlike,confirmedMixups,autoAcceptable,looksLikeGoofing,stripFillers,pairKey,AUTO_OK_MIN};
