'use strict';
// Nota #7: a barra de rolagem da lista ocupa largura só nas linhas; o cabeçalho da grade desconta a mesma
// largura (variável --library-scrollbar) para cabeçalho, divisória e linhas terminarem no mesmo ponto.
(() => {
  // O mesmo vale para a fila: "Agora" e "A seguir" descontam a barra de #queue-list (--queue-scrollbar).
  for(const [list,host,name]of [['library','.collection','--library-scrollbar'],['queue-list','aside','--queue-scrollbar']]){
    const el=document.getElementById(list),section=el?.closest(host);if(!section)continue;
    const sync=()=>section.style.setProperty(name,(el.offsetWidth-el.clientWidth)+'px');
    new ResizeObserver(sync).observe(el);new MutationObserver(sync).observe(el,{childList:true});sync();}
})();
// Notas #1/#2: a ordenação passa para a mesma barra de Filtros e Playlists (proximidade; uma linha de controles a menos).
(() => {
  const sort=document.querySelector('.filterbar .sort-label'),tools=document.getElementById('library-tools');
  if(sort&&tools)tools.append(sort);
})();
