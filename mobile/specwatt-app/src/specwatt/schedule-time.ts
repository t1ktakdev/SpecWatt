import {ApiError} from './api.ts';
/** Device-local wall clock input; reject calendar normalization and DST uncertainty. */
export function localStartToUtc(value: string): string {
  const match=/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(value.trim());
  if(!match) throw new ApiError('invalid_local_time');
  const [,day,month,year,hour,minute]=match.map(Number);
  if(year<2000||year>2100)throw new ApiError('invalid_local_time');
  const date=new Date(year,month-1,day,hour,minute);
  const matches=(d:Date)=>d.getFullYear()===year&&d.getMonth()===month-1&&d.getDate()===day&&d.getHours()===hour&&d.getMinutes()===minute;
  if(!matches(date))throw new ApiError('invalid_local_time');
  // Covers modern timezone transitions, including half-hour shifts. Never guess
  // which instance of a repeated wall-clock minute the owner intended.
  for(let offset=-180;offset<=180;offset+=15) {
    if(offset!==0&&matches(new Date(date.getTime()+offset*60000)))throw new ApiError('invalid_local_time');
  }
  return date.toISOString().replace('.000Z','Z');
}
export function formatLocalStart(date:Date): string {
  const pad=(n:number)=>String(n).padStart(2,'0');
  return `${pad(date.getDate())}.${pad(date.getMonth()+1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
