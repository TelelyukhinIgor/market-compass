import type {Bar} from './market';

export type TimeMark={position:number,label:string,date:string,session?:'London'|'New York'};
const formatter=(zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const lj=formatter('Europe/Ljubljana'),ny=formatter('America/New_York'),ld=formatter('Europe/London');
function parts(t:number,f:Intl.DateTimeFormat){const p=f.formatToParts(new Date(t));const v=(k:string)=>p.find(x=>x.type===k)?.value||'';return {date:`${v('year')}-${v('month')}-${v('day')}`,day:v('weekday'),hour:Number(v('hour')),minute:Number(v('minute'))};}
const epoch=(s:string)=>Date.parse(s.includes('T')?s:s.replace(' ','T')+(s.length===10?'T00:00:00Z':'Z'));

export function chartTimeMarks(rows:Bar[],tf:string){
 const grid:TimeMark[]=[],sessions:TimeMark[]=[];
 const duration=({M15:900000,H1:3600000,H4:14400000} as Record<string,number>)[tf];
 if(!duration){
  let previous='';
  rows.forEach((r,i)=>{const d=new Date(r.time.slice(0,10)+'T12:00:00Z');const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const key=tf==='D1'?monday.toISOString().slice(0,10):r.time.slice(0,7);if(key!==previous){grid.push({position:i+.5,label:r.time.slice(8,10)+'.'+r.time.slice(5,7),date:r.time.slice(0,10)});previous=key;}});
  return {grid,sessions};
 }
 let previousDay="";
 rows.forEach((r,i)=>{
  const start=epoch(r.time);
  const first=parts(start,lj);
  if(["H1","H4"].includes(tf)&&first.date!==previousDay&&first.hour!==0&&(i===0||parts(epoch(rows[i-1].time)+duration-1,lj).date!==first.date))grid.push({position:i+.5,label:String(first.hour).padStart(2,"0")+":"+String(first.minute).padStart(2,"0"),date:first.date});
  previousDay=first.date;
  for(let t=Math.ceil(start/1800000)*1800000;t<start+duration;t+=1800000){
   const p=parts(t,lj),position=i+.5+(t-start)/duration;
   if(p.minute===0&&(tf==='M15'?p.hour%2===0:p.hour===0))grid.push({position,label:String(p.hour).padStart(2,'0')+':00',date:p.date});
   if(tf==='H4'||['Sat','Sun'].includes(p.day))continue;
   const l=parts(t,ld),n=parts(t,ny);
   if(l.hour===8&&l.minute===0)sessions.push({position,label:String(p.hour).padStart(2,'0')+':'+String(p.minute).padStart(2,'0'),date:p.date,session:'London'});
   if(n.hour===9&&n.minute===30)sessions.push({position,label:String(p.hour).padStart(2,'0')+':'+String(p.minute).padStart(2,'0'),date:p.date,session:'New York'});
  }
 });
 return {grid,sessions};
}

export function spacedTimeLabels(marks:TimeMark[],pixelsPerBar:number,minGap=92){
 const result:TimeMark[]=[];let last=-Infinity;
 for(const m of marks){const px=m.position*pixelsPerBar;if(px-last>=minGap&&px<=770-35){result.push(m);last=px;}}
 return result;
}
