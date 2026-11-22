import { campaignData } from './campaign-data.js';
import { expansionData } from './expansion-data.js';
import { encoreData } from './encore-data.js';
import { frostData } from './frost-data.js';

const specs = [
  [4,2,[1,2,3,8, 7,9,5,2, 2,4,6,9, 9,5,8,7],[0,2,8,10]],
  [4,2,[2,5,9,7, 8,4,2,1, 3,6,9,5, 7,2,5,8],[4,7,8,10]],
];
export const chapters = [
  { id: 'first', name: '첫 번째 별', subtitle: '연결의 즐거움을 알아가요', symbol: '✦' },
  { id: 'grove', name: '망고 숲', subtitle: '나만의 수열을 찾아요', symbol: '❋' },
  { id: 'orbit', name: '별의 궤도', subtitle: '다음 움직임을 생각해요', symbol: '✧' },
  { id: 'weave', name: '별의 갈림길', subtitle: '남겨 둔 숫자를 다시 만나요', symbol: '✶' },
  { id: 'summit', name: '별의 정상', subtitle: '마지막 연결까지 내다봐요', symbol: '✷' },
  { id: 'dawn', name: '새벽의 별', subtitle: '다시 길을 찾아요', symbol: '✦' },
  { id: 'river', name: '별의 강', subtitle: '흐름을 따라 생각해요', symbol: '✧' },
  { id: 'prism', name: '빛의 조각', subtitle: '여러 길을 비교해요', symbol: '❋' },
  { id: 'horizon', name: '먼 별자리', subtitle: '다음 낙하를 내다봐요', symbol: '✶' },
  { id: 'crown', name: '백 번째 별', subtitle: '마지막 별까지 이어가요', symbol: '✷' },
  { id: 'frost', name: '서리 정원', subtitle: '얼음을 깨고 남은 숫자를 다시 이어요', symbol: '❄' },
];

const tutorials = [
  [3, 1, [7,9,5, 8,5,9, 1,2,3], [6,8], '첫 연결', '이웃한 숫자 3개 이상을 누른 채 이어요. 같은 간격의 수열로 별을 모두 모으세요.'],
  [3, 1, [9,1,8, 5,9,1, 2,4,6], [6,8], '같은 간격', '숫자가 2씩, 3씩 커져도 같은 간격이면 연결할 수 있어요.'],
  [3, 1, [1,7,5, 8,2,7, 9,6,3], [6,8], '거꾸로도 좋아', '같은 간격으로 작아지는 수열도 연결돼요.'],
  [3, 1, [1,9,7, 8,2,9, 5,7,3], [0,4,8], '비스듬한 길', '모서리가 맞닿은 대각선 타일도 이웃이에요.'],
  [3, 1, [8,2,9, 1,3,8, 9,7,5], [3,4,8], '꺾이는 길', '이어지는 숫자가 수열이면 중간에 방향을 꺾어도 괜찮아요.'],
  [3, 1, [9,3,7, 5,9,1, 2,4,8], [6,8], '곱하는 수열', '같은 수를 계속 곱하는 등비수열도 연결할 수 있어요.'],
  [3, 1, [1,8,6, 9,2,7, 3,3,3], [6,8], '같아도 수열', '같은 숫자 세 개도 간격이 0인 수열이에요.'],
  [4, 1, [7,9,5,8, 9,5,8,6, 6,8,9,7, 1,2,3,4], [12,15], '길게 한 번', '3개보다 길게 이어도 한 번! 남은 횟수 안에 별을 모두 모으세요.'],
];

const make = (n, moves, values, ss, key, extra, frost = []) => ({ n, moves, key, ...extra,
  board: values.map((v, j) => v === null ? null : ({ v, star: ss.includes(j), ...(frost.includes(j) ? { frost: true } : {}), id: `${key}-${j}` })) });
const originalNames = ['두 번의 연결', '새로운 간격'];
const campaignNames = ['갈림길', '남겨 둔 숫자', '연결의 순서', '두 가지 수열', '한 수 먼저', '숲의 마지막 길', '연쇄 낙하', '엇갈린 수열', '남겨야 할 별', '숲의 미로', '새로운 궤도', '교차하는 길', '별의 자리', '네 번의 생각', '다섯 걸음', '멀리 있는 별', '빈자리의 의미', '이어지는 별', '마지막 갈림길', '별자리 완성'];
const expansionNames = ['다시 한 걸음', '두 가지 간격', '빈손의 시작', '겹친 궤도', '첫 번째 고개', '작은 쉼표', '곱과 차', '기다리는 별', '엇갈린 낙하', '두 번째 고개', '작은 별밭', '바뀌는 간격', '보이지 않는 길', '다섯 번의 선택', '세 번째 고개', '잠깐의 여유', '맞물린 수열', '마지막 준비', '정상으로', '쉰 번째 별'];
const encoreNames = ['다시 뜬 별', '갈라지는 길', '별 없는 첫걸음', '내려오는 숫자', '다섯 번째 선택', '작은 숨', '엇갈린 길', '숨겨 둔 별', '남겨 둔 숫자', '새벽의 끝', '강가의 별', '두 갈래 흐름', '빈자리 먼저', '흐르는 수열', '돌아오는 길', '잠깐의 빛', '서로 다른 간격', '기다린 연결', '긴 낙하', '강 건너 별', '빛나는 숫자', '엇갈린 간격', '준비하는 손', '달라진 자리', '빛의 고개', '잠시 쉬어가기', '두 번의 생각', '사라진 별자리', '숫자의 그림자', '빛의 마지막 길', '멀리 뜬 별', '새로운 갈림길', '보이지 않는 첫 수', '끝까지 내려가', '먼 길의 별', '한 번 더', '비슷한 수열', '순서의 비밀', '다음 자리', '지평선의 끝', '왕관의 첫 별', '끝을 향한 길', '먼저 비우기', '마지막 낙하', '남은 별 하나', '잠깐의 여유', '엇바뀐 자리', '별을 잇는 순서', '아흔아홉 번째 별', '백 번째 별'];
export const levels = [
  ...tutorials.map(([n,m,v,s,title,lesson], i) => make(n,m,v,s,`intro-${i+1}`, { chapter: 'first', title, lesson, objective: 'tutorial' })),
  ...specs.map(([n,m,v,s], i) => make(n,m,v,s,`original-${i+1}`, { chapter: 'first', title: originalNames[i], legacyIndex: i, objective: 'practice', ...(i === 0 ? { lesson: '타일을 지우면 위의 숫자가 내려와요. 새 타일은 생기지 않아요.' } : {}) })),
  ...campaignData.map((l,i) => make(l.n,l.moves,l.values,l.stars,`complex-v3-${i+11}`, { chapter: i < 10 ? 'grove' : 'orbit', title: campaignNames[i], objective: l.objective })),
  ...expansionData.map((l,i) => make(l.n,l.moves,l.values,l.stars,`expansion-v1-${i+31}`, { chapter: i < 10 ? 'weave' : 'summit', title: expansionNames[i], objective: l.objective })),
  ...encoreData.map((l,i) => make(l.n,l.moves,l.values,l.stars,`encore-v1-${i+51}`, { chapter: ['dawn', 'river', 'prism', 'horizon', 'crown'][Math.floor(i / 10)], title: encoreNames[i], objective: l.objective })),
  ...frostData.map((l, i) => make(l.n, l.moves, l.values, l.stars, `frost-v1-${i + 101}`, {
    chapter: 'frost', title: l.title, lesson: l.lesson, objective: 'frost',
  }, l.frost)),
].map((level, i) => ({ ...level, id: i + 1 }));
