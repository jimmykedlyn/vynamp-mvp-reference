# Handoff para Claude Code — Vynamp Media Player Rev.42

## Contexto do Projeto

Este é o **Vynamp Media Player**, um player de áudio com design premium estilo audiófilo vintage. A referência interativa está em `outputs/vynamp-extended/interactive/` e é servida por `review/server.cjs` na porta 8765.

### Stack
- HTML5 + SVG + CSS3 (sem frameworks)
- JavaScript vanilla (ES2020+)
- Web Audio API para DSP
- Node.js (apenas para servidor de desenvolvimento)

---

## Estado Atual (Novembro 2026)

### Commits Recentes (Rev.42)
```
923e053 - Rev.42 fix: original render() só aplica stroke ao wave-played, preservando wave-base amber
79811c4 - Rev.42 fix: original usa !important para proteger wave-base amber contra neon-customizer
0ab27db - Rev.42 fix: original preserva wave-base em amber, apenas wave-played segue neon-wave-readable
ff7c968 - Rev.42 fix: original sempre usa --neon-wave-readable via CSS, sincronizando com painel mestre
2f5f831 - Rev.42 fix: original sincroniza com neon-customizer via evento vynamp:neon-change
d92446c - Rev.42: original usa waveColor unificada com swatches neon do painel de aparência
b0d4310 - Rev.42 fix: original aplica cores nos paths corretos + controles de cor customizados
d4b13f0 - Rev.42: original/dj/overview usam cores configuráveis (hot/core) em vez de geometria
dd68a35 - Rev.42 fix: integra todas as configs do painel às funções de desenho de waveform
1a6e593 - Rev.42 fix: choose() dispara evento vynamp:waveform-style para mover engrenagem
```

---

## Arquitetura da Solução — Estilo "Original"

### Problema Resolvido
O utilizador pediu que o estilo de waveform "Original" tivesse **uma única configuração de cor** que:
1. Refletisse no painel de Preferências → Aparência → Waveform (mesmas swatches neon)
2. Permitisse "Seguir accent" (herdar da cor mestre)
3. **Não alterasse o background cinza/âmbar** da waveform

### Implementação

#### 1. CSS (`waveform-styles.css` linha 29)
```css
html[data-wave-style=original] #wave-base{stroke:var(--amber)!important;opacity:.48!important}
html[data-wave-style=original] #wave-played{stroke:var(--neon-wave-readable)!important;opacity:1!important}
```
- `#wave-base` = waveform não tocada (sempre âmbar, preserva o "cinza" de fundo)
- `#wave-played` = waveform tocada (segue a cor neon configurada)
- `!important` protege contra sobrescritas do `neon-customizer.css`

#### 2. JS (`waveform-styles.js` render())
```javascript
if(selected==='original'){
  const wc=cfg.waveColor||'inherit';
  const wp=$('wave-played');
  if(wp)wp.style.stroke=wc==='inherit'?'':(window.VynampNeon?.palette.find(p=>p.id===wc)?.hex||'#39dfff');
}
```
- Quando `waveColor==='inherit'`, remove stroke inline para o CSS assumir
- Quando é uma cor específica, aplica **apenas ao `#wave-played`**
- Nunca toca no `#wave-base` (protegido por CSS)

#### 3. Configuração (`waveform-styles.js` defaultConfigs)
```javascript
'original':{waveColor:'inherit'}
```

#### 4. Sincronização (`neon-customizer.js` linha 29)
```javascript
button.onclick=()=>{
  // ... salva preferência ...
  document.dispatchEvent(new CustomEvent('vynamp:neon-change',{detail:{part,id}}));
};
```
Dispara evento quando a cor muda no painel de Preferências.

#### 5. Listener (`waveform-styles.js`)
```javascript
document.addEventListener('vynamp:neon-change',event=>{
  if(selected==='original'&&(!event.detail||event.detail.part==='wave'||event.detail.part==='accent'))
    render();
});
```
Re-renderiza o estilo Original quando a cor de Waveform ou Accent muda.

---

## Próximos Passos Sugeridos

### 1. Testar o Estilo Original
1. Abrir http://localhost:8765
2. Selecionar "Original" no menu de estilos de waveform
3. Clicar na engrenagem ⚙ do item Original
4. Testar:
   - "Seguir Preferências" (↗) → deve seguir a cor do painel Aparência
   - Qualquer cor neon → deve mudar apenas a parte tocada da waveform
   - O fundo cinza/âmbar deve permanecer inalterado em todos os casos

### 2. Revisar Outros Estilos com Configuração de Cor
Os estilos `dj` e `overview` usam `hotColor` e `coreColor` (duas cores):
```javascript
'dj':{hotColor:'#f2a12c',coreColor:'#4c9af0'}
'overview':{hotColor:'#f2a12c',coreColor:'#f2a12c'}
```
Verificar se estão a funcionar corretamente.

### 3. Verificar Todos os Modos de Waveform
Confirmar que todos os 17 estilos respondem às suas configurações:
- `pulse`: `samples`, `amplitude`
- `bars-pulse`: `bars`, `gain`, `smoothing`
- `spectrum-*`: `dbRange`
- `columns-pulse`: `columns`, `gain`, `height`
- etc.

### 4. Regressão de Vinyl/Tube Realism (Rev.42)
Os toggles de realismo Vinyl/Tube foram implementados em `advanced-dsp.js`. Verificar:
- 11 toggles independentes
- 2 presets
- Funcionam com presets existentes e novos

---

## Ficheiros Relevantes

| Ficheiro | Descrição |
|----------|-----------|
| `waveform-styles.js` | Lógica dos 17 estilos de waveform, painel de configurações, render() |
| `waveform-styles.css` | CSS dos estilos de waveform, regras de cor, swatches |
| `neon-customizer.js` | Painel de Preferências → Aparência, paleta neon, variáveis CSS |
| `neon-customizer.css` | CSS do customizador de neon |
| `visualizer-favorites.js` | Ícone de engrenagem ⚙ e favoritos de waveform |
| `advanced-dsp.js` | Toggles Vinyl/Tube Realism (Rev.42) |
| `dsp-catalog.js` | Schemas UI dos módulos DSP |
| `graph-model.js` | Validação e migração de grafos DSP |
| `player.js` | Player principal, setWave() |
| `index.html` | HTML do MVP |

---

## Comandos Úteis

### Iniciar Servidor
```bash
cd "D:\Projects\vynamp-media-player\referenced-chatgpt-conversation-this-is-an"
node review/server.cjs
```

### Matar Servidor na Porta 8765 (PowerShell)
```powershell
Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

### Verificar Servidor
```powershell
Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Select-Object OwningProcess,State
```

### Commit e Push
```bash
git add -A && git commit -m "Descrição da mudança"
```

---

## Paleta Neon (do `neon-customizer.js`)

| ID | Nome | Hex |
|----|------|-----|
| lime | Lima | #B8FF38 |
| cyan | Ciano | #38E8FF |
| pink | Rosa | #FF58D6 |
| violet | Violeta | #B084FF |
| blue | Azul | #6DA2FF |
| green | Verde | #32FFA0 |
| yellow | Amarelo | #F5FF40 |
| orange | Laranja | #FFAB45 |
| red | Coral | #FF647C |
| ice | Menta | #A0FFF4 |

---

## Variáveis CSS Importantes

```css
--neon-wave-readable  /* Cor da waveform legível sobre o fundo */
--neon-wave           /* Cor bruta da waveform */
--neon-accent         /* Cor de destaque global */
--amber               /* Cor âmbar padrão (#ffbf69) */
--background          /* Fundo principal (#11131b) */
--panel-inset         /* Painéis embutidos (#191d2a) */
```

---

## Notas de Design

- **WCAG 2.2 AA**: Contraste mínimo 4.5:1 para texto, 3:1 para elementos grandes
- **Badges**: DEMO badge visível quando em modo demonstração
- **Token Colors**: Cores vêm dos tokens de cada skin (12 skins disponíveis)
- **Marca Vértice**: Design original, sem cópias de outros players

---

## Problemas Conhecidos / TODO

1. **spectrum-pulse**: Verificar se `bars` e `height` estão a renderizar corretamente após a correção
2. **aurora-constellation**: Confirmar que `dbRange` está a ser passado para `spectrumBands`
3. **DJ bicolor**: O utilizador pediu apenas duas cores (`hotColor`, `coreColor`) — verificar se está simples o suficiente
4. **Panorâmica âmbar**: Deve ter apenas configuração de cores, verificar se está correto

---

## Contacto

O utilizador comunica em **português do Brasil**. Responder sempre nesse idioma.

---

*Documento gerado em 2026-11-02. Última atualização: commit 923e053.*