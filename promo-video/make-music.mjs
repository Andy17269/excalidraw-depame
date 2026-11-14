// Original generative score: 100 BPM / D major / 20 bars / 48 seconds.
// Synthesized locally, no third-party recordings or samples.
import {writeFileSync} from 'node:fs';
const sr=48000,seconds=48,N=sr*seconds,L=new Float32Array(N),R=new Float32Array(N);
const hz=n=>440*2**((n-69)/12);
function tone(at,dur,n,amp,kind='pluck',pan=0){const start=Math.round(at*sr),len=Math.min(Math.round(dur*sr),N-start),f=hz(n);for(let i=0;i<len;i++){const t=i/sr;let env,s;if(kind==='pad'){env=Math.min(t/.65,1)*Math.min((dur-t)/.9,1);s=(Math.sin(2*Math.PI*f*t)+.25*Math.sin(2*Math.PI*f*2.001*t))*.6;}else if(kind==='bass'){env=Math.min(t/.02,1)*Math.exp(-t*2.4);s=Math.sin(2*Math.PI*f*t);}else{env=(1-Math.exp(-t*100))*Math.exp(-t*3.7);s=Math.sin(2*Math.PI*f*t)+.32*Math.sin(2*Math.PI*f*2*t)*Math.exp(-t*7)+.1*Math.sin(2*Math.PI*f*3*t)*Math.exp(-t*10)}const v=s*env*amp;L[start+i]+=v*(1-pan*.4);R[start+i]+=v*(1+pan*.4);}}
const chords=[[50,57,61,66],[47,54,59,62],[43,50,57,59],[45,52,57,61]];
for(let bar=0;bar<20;bar++){const at=bar*2.4,c=chords[bar%4];for(const n of c)tone(at,3.1,n,.032,'pad');if(bar>1&&bar<18){tone(at,1.6,c[0]-12,.15,'bass');tone(at+1.2,1,c[0]-12,.09,'bass')}const notes=[c[1]+12,c[2]+12,c[3]+12,c[2]+12];for(let k=0;k<4;k++){if(bar<2&&k%2)continue;tone(at+k*.6,2,notes[k],bar>16?.075:.105,'pluck',k%2?-.45:.45)}}
// Delicate high motif, repeating with the feature changes.
for(const at of [5.2,12.4,18.4,27.4,33.4,39.4,44.2]){tone(at,2.5,81,.065,'pluck',-.4);tone(at+.3,2.5,78,.055,'pluck',.4)}
// Stereo echo, tapered beginning and ending.
for(let i=0;i<N;i++){if(i>sr*.225)L[i]+=R[i-Math.round(sr*.225)]*.12;if(i>sr*.325)R[i]+=L[i-Math.round(sr*.325)]*.10}
let peak=0;for(let i=0;i<N;i++){const e=Math.min(i/sr/1.2,1,(seconds-i/sr)/2);L[i]*=e;R[i]*=e;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]))}const wav=Buffer.alloc(44+N*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(N*4,40);for(let i=0;i<N;i++){wav.writeInt16LE(Math.round(L[i]/peak*.65*32767),44+i*4);wav.writeInt16LE(Math.round(R[i]/peak*.65*32767),46+i*4)}writeFileSync(new URL('music.wav',import.meta.url),wav);console.log('48s original stereo score written');
