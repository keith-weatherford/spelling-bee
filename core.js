
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
      if (["hyphen","dash","space","capital","uppercase","uh","um","er"].includes(t)) continue;
      // Google sometimes writes a letter as its name inside a joined run ("younwavering" for U-N-W...):
      // keep the raw reading first, plus readings with letter names swapped back to letters
      merged = true; pieces.push([t, ...nameVariants(t)]); continue;
    }
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
  return {letters, merged, alts, ambiguous, mergedWords, cloud: !!opts.joined};
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
function scoreBee(attemptTexts, target, strict, st, notes){
  // after a start-over, the cut can catch the tail of "start over"; no bee word on the list starts with these
  attemptTexts = attemptTexts.map((a,k) => k===0 ? a : a.replace(/^\s*(?:(?:start|over|again|restart)\b\s*)+/i, "").replace(/^\s*(over|again)(?=[a-z]{2,})/i, ""));
  const parsed = attemptTexts.map(a => { const words = splitGlued(a.split(/\s+/).filter(Boolean).map(w=>({w, s:null, e:null})), target);
    return parseLetters(words.map(x=>x.w).join(" "), target, {joined:true}); });
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
  return { attempts: parsed.map(p=>p.letters), final: finalLetters, verdict, opening: !!st.opening, locked: !!st.closing,
           restarts: st.restarts.length, violation, notes, plainText: st.plainText, timed: st.timed };
}
/* preferred: letters transcribed separately for each window of audio (letterTexts[i] for st.windows[i]) */
function analyzeBeeWindows(st, letterTexts, target, strict){ return scoreBee(letterTexts, target, strict, st, []); }
/* fallback: one letter pass over the whole recording, split by word timestamps if Google gave them */
function analyzeBee(plainResults, letterResults, target, strict){
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
  return scoreBee(attempts, target, strict, st, notes);
}
if (typeof module!=="undefined") module.exports={parseLetters,verdictFor,isSubseq,isCorrect,align,anyAltCorrect,targetForms,analyzeBee,analyzeBeeWindows,beeStructure,splitGlued,isLockedIn,findWordHits,findRestarts,wordsOf};
