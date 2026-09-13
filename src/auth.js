const crypto = require('crypto');
const COOKIE='automix_session'; const MAX_AGE_SECONDS=30*24*60*60;
function enabled(){return Boolean(process.env.PANEL_PASSWORD);} function secret(){return process.env.APP_SECRET||'unsafe-development-secret';} function hmac(value){return crypto.createHmac('sha256',secret()).update(value).digest('hex');}
function safeEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));if(aa.length!==bb.length)return false;return crypto.timingSafeEqual(aa,bb);}
function cookies(req){const out={};for(const pair of String(req.headers.cookie||'').split(';')){const i=pair.indexOf('=');if(i<0)continue;out[decodeURIComponent(pair.slice(0,i).trim())]=decodeURIComponent(pair.slice(i+1).trim());}return out;}
function issueToken(){const exp=Math.floor(Date.now()/1000)+MAX_AGE_SECONDS;const nonce=crypto.randomBytes(12).toString('hex');const body=`${exp}.${nonce}`;return `${body}.${hmac(body)}`;}
function verifyToken(token){const[exp,nonce,sig]=String(token||'').split('.');if(!exp||!nonce||!sig||Number(exp)<Math.floor(Date.now()/1000))return false;return safeEqual(sig,hmac(`${exp}.${nonce}`));}
function isAuthenticated(req){return !enabled()||verifyToken(cookies(req)[COOKIE]);}
function secureRequest(req){return req.secure||String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https'||process.env.FORCE_SECURE_COOKIE==='1';}
function setCookie(res,req){const parts=[`${COOKIE}=${encodeURIComponent(issueToken())}`,'Path=/',`Max-Age=${MAX_AGE_SECONDS}`,'HttpOnly','SameSite=Lax'];if(secureRequest(req))parts.push('Secure');res.setHeader('Set-Cookie',parts.join('; '));}
function clearCookie(res,req){const parts=[`${COOKIE}=`,'Path=/','Max-Age=0','HttpOnly','SameSite=Lax'];if(secureRequest(req))parts.push('Secure');res.setHeader('Set-Cookie',parts.join('; '));}
function login(req,res){if(!enabled())return res.json({ok:true,authRequired:false});const supplied=String(req.body?.password||'');if(!safeEqual(supplied,process.env.PANEL_PASSWORD||''))return res.status(401).json({error:'Panel paroli noto‘g‘ri'});setCookie(res,req);return res.json({ok:true,authRequired:true});}
function requireApi(req,res,next){if(isAuthenticated(req))return next();return res.status(401).json({error:'AUTH_REQUIRED',authRequired:true});}
function requirePage(req,res,next){if(isAuthenticated(req))return next();return res.redirect('/?login=1');}
module.exports={enabled,isAuthenticated,login,requireApi,requirePage,clearCookie};
