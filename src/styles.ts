export const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#010308;color:#c4d4f0;font-family:'JetBrains Mono',monospace;font-size:13px}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#010308}::-webkit-scrollbar-thumb{background:#0d1f2d;border-radius:2px}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden;position:relative;background:radial-gradient(ellipse 80% 50% at 10% 0%,rgba(0,245,255,0.03) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 90% 100%,rgba(139,92,246,0.04) 0%,transparent 60%),#010308}
.hdr{background:rgba(1,3,8,0.97);border-bottom:1px solid rgba(0,245,255,0.1);padding:7px 13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:relative}
.hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,rgba(0,245,255,0.3) 30%,rgba(139,92,246,0.3) 70%,transparent 100%)}
.logo{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;letter-spacing:2px;white-space:nowrap;color:#38bdf8;text-transform:uppercase;text-shadow:0 0 16px rgba(56,189,248,0.4)}
.logo em{color:#a78bfa;font-style:normal;text-shadow:0 0 16px rgba(167,139,250,0.5)}
@keyframes glitch{0%,90%,100%{text-shadow:0 0 16px rgba(56,189,248,0.4)}92%{text-shadow:-2px 0 rgba(236,72,153,0.7),2px 0 rgba(0,245,255,0.7)}95%{text-shadow:2px 0 rgba(139,92,246,0.7),-2px 0 rgba(56,189,248,0.4)}98%{text-shadow:0 0 24px rgba(56,189,248,0.9)}}
.logo{animation:glitch 7s ease-in-out infinite}
.hstats{display:flex;gap:10px;align-items:center;flex:1;flex-wrap:wrap}
.hs{text-align:center}
.hs-v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#00f5ff;text-shadow:0 0 8px rgba(0,245,255,0.5)}
.hs-l{font-size:7px;color:#475569;text-transform:uppercase;letter-spacing:.5px;font-family:'JetBrains Mono',monospace}
.dot{width:7px;height:7px;border-radius:50%;background:#00f5ff;box-shadow:0 0 10px #00f5ff,0 0 20px rgba(0,245,255,0.4);animation:pulse-c 2s ease-in-out infinite;flex-shrink:0}
.dot.off{background:#ef4444;box-shadow:0 0 8px #ef4444;animation:none}
.dot.y{background:#facc15;box-shadow:0 0 8px #facc15;animation:pulse-y 1s infinite}
@keyframes pulse-c{0%,100%{box-shadow:0 0 8px #00f5ff,0 0 16px rgba(0,245,255,0.3)}50%{box-shadow:0 0 18px #00f5ff,0 0 36px rgba(0,245,255,0.6)}}
@keyframes pulse-y{0%,100%{opacity:1}50%{opacity:.3}}
.mono{font-family:'JetBrains Mono',monospace;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
.tabs{display:flex;gap:2px;padding:5px 10px 0;background:rgba(1,3,8,0.97);border-bottom:1px solid rgba(0,245,255,0.08);overflow-x:auto}
.tab{padding:5px 12px;border-radius:5px 5px 0 0;cursor:pointer;font-size:10px;font-weight:700;color:#64748b;border:1px solid transparent;border-bottom:none;white-space:nowrap;transition:all .2s;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.tab:hover{color:#38bdf8;border-color:rgba(56,189,248,0.15)}
.tab.on{background:rgba(0,245,255,0.04);color:#00f5ff;border-color:rgba(0,245,255,0.18);border-bottom-color:rgba(1,3,8,0.97);margin-bottom:-1px;text-shadow:0 0 10px rgba(0,245,255,0.5)}
.tbadge{background:rgba(0,245,255,0.04);color:#64748b;font-size:8px;padding:1px 5px;border-radius:6px;margin-left:4px;font-family:'JetBrains Mono',monospace}
.tab.on .tbadge{background:rgba(0,245,255,0.12);color:#38bdf8}
.tbadge.hot{background:rgba(0,245,255,0.18)!important;color:#00f5ff!important;box-shadow:0 0 8px rgba(0,245,255,0.3);animation:pulse-y 1s infinite}
.tbadge.danger{background:rgba(239,68,68,0.15)!important;color:#f87171!important}
.body{flex:1;overflow-y:auto;padding:8px 10px;position:relative;z-index:2}
.srow{display:flex;gap:5px;margin-bottom:9px;flex-wrap:wrap}
.sc{flex:1;min-width:62px;background:rgba(0,245,255,0.02);border:1px solid rgba(0,245,255,0.1);border-radius:8px;padding:6px 8px;backdrop-filter:blur(4px)}
.sc-v{font-size:19px;font-weight:700;font-family:'JetBrains Mono',monospace}
.sc-l{font-size:7px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;font-family:'JetBrains Mono',monospace}
.sc.g .sc-v{color:#00f5ff;text-shadow:0 0 10px rgba(0,245,255,0.5)}.sc.b .sc-v{color:#a78bfa;text-shadow:0 0 10px rgba(167,139,250,0.4)}.sc.y .sc-v{color:#facc15}.sc.r .sc-v{color:#ef4444}.sc.w .sc-v{color:#38bdf8}
.fbar{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;align-items:center}
.fbtn{padding:3px 9px;border-radius:4px;cursor:pointer;font-size:9px;font-weight:700;border:1px solid rgba(100,116,139,0.3);background:rgba(100,116,139,0.08);color:#94a3b8;transition:all .15s;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.4px}
.fbtn:hover{border-color:rgba(0,245,255,0.25);color:#38bdf8}
.fbtn.on{background:rgba(0,245,255,0.07);color:#00f5ff;border-color:rgba(0,245,255,0.28);text-shadow:0 0 8px rgba(0,245,255,0.4)}
.sep{width:1px;height:16px;background:rgba(0,245,255,0.08);margin:0 2px}
.tcards{display:flex;flex-direction:column;gap:5px}
.tcard{background:rgba(2,4,10,0.85);border:1px solid rgba(0,245,255,0.07);border-radius:10px;overflow:hidden;transition:border-color .2s,box-shadow .2s;backdrop-filter:blur(6px)}
.tcard:hover{border-color:rgba(0,245,255,0.18);box-shadow:0 0 24px rgba(0,245,255,0.05)}
.tcard.sS{border-left:2px solid #00f5ff;box-shadow:-3px 0 20px rgba(0,245,255,0.2)}
.tcard.sE{border-left:2px solid #a78bfa;box-shadow:-2px 0 12px rgba(167,139,250,0.15)}
.tcard.sW{border-left:2px solid #facc15}
.tcard.sR{border-left:2px solid #f97316}
.tcard.sX{border-left:2px solid #ef4444;opacity:.5}
.tcard.sK{border-left:2px solid #0d1f2d;opacity:.22}
.tcard.bl{filter:grayscale(1);opacity:.15}
.th{padding:8px 11px;cursor:pointer;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.sbadge{display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:5px;font-weight:800;font-size:10px;white-space:nowrap;flex-shrink:0;font-family:'JetBrains Mono',monospace;letter-spacing:.3px}
.tsym{font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:#c4d4f0;letter-spacing:.5px}
.tname{font-size:8px;color:#475569}
.tmeta{margin-left:auto;display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.tmc{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:800;color:#00f5ff;text-shadow:0 0 10px rgba(0,245,255,0.5)}
.tinfo{font-size:8px;color:#475569}
.chev{color:#475569;font-size:9px}
.tbody{padding:0 11px 11px;border-top:1px solid rgba(0,245,255,0.05)}
.age-f{color:#00f5ff;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:11px;text-shadow:0 0 8px rgba(0,245,255,0.5)}
.age-o{color:#facc15;font-weight:700;font-family:'JetBrains Mono',monospace;font-size:11px}
.age-s{color:#ef4444;font-family:'JetBrains Mono',monospace;font-size:10px;opacity:.5}
.snpanel{background:rgba(0,0,0,0.6);border:1px solid rgba(0,245,255,0.07);border-radius:8px;padding:9px 11px;margin-top:9px;backdrop-filter:blur(8px)}
.snhead{display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.snverdict{padding:4px 13px;border-radius:5px;font-weight:800;font-size:13px;border:2px solid;flex-shrink:0;font-family:'JetBrains Mono',monospace;letter-spacing:.5px}
.snflags{display:flex;flex-direction:column;gap:3px;margin-top:6px}
.sf{font-size:10px;padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace}
.sf.green{background:rgba(0,245,255,0.06);color:#4ade80;border-left:1px solid rgba(0,245,255,0.2)}
.sf.orange{background:rgba(249,115,22,0.07);color:#fb923c}
.sf.red{background:rgba(239,68,68,0.08);color:#f87171;border-left:1px solid rgba(239,68,68,0.3)}
.bsell-warn{background:rgba(127,29,29,0.6);border:1px solid rgba(248,113,113,0.3);border-radius:6px;padding:5px 9px;margin-top:5px;font-size:11px;color:#f87171;font-weight:700;font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:5px}
.bl-badge{background:rgba(26,10,10,0.9);border:1px solid rgba(127,29,29,0.6);border-radius:4px;padding:1px 6px;font-size:8px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:.3px;font-family:'JetBrains Mono',monospace}
.dev-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,245,255,0.05);font-size:10px}
.mrow{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}
.met{background:rgba(0,0,0,0.5);border:1px solid rgba(0,245,255,0.07);border-radius:6px;padding:5px 9px;min-width:68px}
.met-v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#00f5ff}
.met-l{font-size:7px;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;font-family:'JetBrains Mono',monospace}
.ttbl{width:100%;border-collapse:collapse;margin-top:5px;font-size:10px}
.ttbl th{color:#475569;text-transform:uppercase;font-size:7px;letter-spacing:.5px;padding:3px 4px;text-align:left;border-bottom:1px solid rgba(0,245,255,0.05);font-family:'JetBrains Mono',monospace}
.ttbl td{padding:3px 4px;border-bottom:1px solid rgba(0,0,0,0.4);font-family:'JetBrains Mono',monospace}
.ttbl tr:last-child td{border-bottom:none}
.ttbl tr:hover td{background:rgba(0,245,255,0.03)}
.ttbl .br td{background:rgba(0,245,255,0.04)}
.buy{color:#00f5ff}.sell{color:#ef4444}.create{color:#a78bfa}.star{color:#fbbf24}
.addrl{font-family:'JetBrains Mono',monospace;font-size:9px;color:#475569}
.plink{display:inline-flex;align-items:center;gap:3px;background:rgba(0,245,255,0.07);color:#00f5ff;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;text-decoration:none;margin-top:5px;border:1px solid rgba(0,245,255,0.2);font-family:'JetBrains Mono',monospace;transition:all .15s}
.plink:hover{background:rgba(0,245,255,0.14);box-shadow:0 0 12px rgba(0,245,255,0.15)}
.devdump{color:#ef4444;font-size:9px;font-weight:700;background:rgba(239,68,68,0.1);padding:2px 5px;border-radius:4px;animation:pulse-y .8s infinite;font-family:'JetBrains Mono',monospace}
.newbadge{background:rgba(0,245,255,0.12);color:#00f5ff;font-size:7px;padding:1px 4px;border-radius:3px;font-weight:700;margin-left:3px;vertical-align:middle;font-family:'JetBrains Mono',monospace}
.pill{padding:2px 6px;border-radius:4px;font-size:8px;font-weight:700;font-family:'JetBrains Mono',monospace}
.pill.g{background:rgba(0,245,255,0.1);color:#00f5ff;border:1px solid rgba(0,245,255,0.2)}.pill.r{background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2)}
.pill.b{background:rgba(167,139,250,0.1);color:#a78bfa;border:1px solid rgba(167,139,250,0.2)}.pill.o{background:rgba(249,115,22,0.1);color:#fb923c}
.vel-row{display:flex;align-items:center;gap:6px;margin-top:6px;padding:5px 8px;background:rgba(0,0,0,0.4);border:1px solid rgba(0,245,255,0.06);border-radius:6px;flex-wrap:wrap}
.vel-bar-bg{height:3px;background:rgba(0,245,255,0.07);border-radius:2px;overflow:hidden;width:80px}
.vel-bar-fill{height:100%;border-radius:2px;transition:width .3s}
.adv-panel{margin-top:8px;background:rgba(0,0,0,0.45);border:1px solid rgba(0,245,255,0.06);border-radius:8px;padding:9px 11px}
.adv-title{font-size:7px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;color:#475569;font-family:'JetBrains Mono',monospace}
.sol-bar-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.sol-bar-bg{flex:1;height:4px;background:rgba(0,245,255,0.05);border-radius:2px;overflow:hidden;max-width:110px}
.sol-bar-fill{height:100%;border-radius:2px;transition:width .4s}
.hbox{background:rgba(0,0,0,0.5);border:1px solid rgba(0,245,255,0.07);border-radius:5px;padding:4px 7px;text-align:center;min-width:58px}
.hbox-v{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#00f5ff}
.hbox-l{font-size:7px;color:#475569;text-transform:uppercase;letter-spacing:.4px;margin-top:1px;font-family:'JetBrains Mono',monospace}
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:6px}
.scard{background:rgba(2,4,10,0.85);border:1px solid rgba(0,245,255,0.07);border-radius:10px;padding:10px 12px;backdrop-filter:blur(4px)}
.scard.strong{border-left:2px solid #00f5ff;box-shadow:-2px 0 14px rgba(0,245,255,0.15)}.scard.medium{border-left:2px solid #a78bfa;box-shadow:-2px 0 10px rgba(167,139,250,0.12)}
.scard.selling{border-left:2px solid #ef4444}.scard.watch{border-left:2px solid #facc15}
.sfeed-row{display:flex;align-items:center;gap:7px;padding:5px 9px;border-bottom:1px solid rgba(0,245,255,0.04)}
.sfeed-row:last-child{border-bottom:none}.sfeed-row:hover{background:rgba(0,245,255,0.02)}
.dex-tag{font-size:7px;padding:1px 5px;border-radius:3px;font-weight:700;background:rgba(167,139,250,0.1);color:#a78bfa;font-family:'JetBrains Mono',monospace;border:1px solid rgba(167,139,250,0.2)}
.loading-dots::after{content:'...';animation:ldots 1s infinite}
@keyframes ldots{0%{content:'.'}33%{content:'..'}66%{content:'...'}}
.ffilters{display:flex;gap:4px;margin-bottom:7px;flex-wrap:wrap}
.alerts{position:fixed;top:60px;right:10px;z-index:300;display:flex;flex-direction:column;gap:5px;pointer-events:none}
.alert-pop{background:rgba(2,4,14,0.96);border:1px solid;border-radius:8px;padding:8px 12px;min-width:220px;max-width:290px;pointer-events:all;animation:popIn .2s ease;box-shadow:0 8px 32px rgba(0,0,0,0.9),0 0 24px rgba(0,245,255,0.08);backdrop-filter:blur(14px)}
@keyframes popIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
.alert-title{font-weight:700;font-size:10px;margin-bottom:2px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.4px}
.alert-body{font-size:10px;color:#94a3b8}
.alert-x{float:right;cursor:pointer;color:#475569;font-size:12px;margin-left:5px}
.helius-input{background:rgba(0,0,0,0.7);border:1px solid rgba(0,245,255,0.18);border-radius:5px;padding:4px 10px;font-size:11px;color:#c4d4f0;font-family:'JetBrains Mono',monospace;width:260px;outline:none;transition:all .2s}
.helius-input:focus{border-color:rgba(0,245,255,0.45);box-shadow:0 0 12px rgba(0,245,255,0.1)}
.helius-btn{background:rgba(0,245,255,0.08);color:#00f5ff;border:1px solid rgba(0,245,255,0.3);border-radius:5px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px;transition:all .15s}
.helius-btn:hover{background:rgba(0,245,255,0.16);box-shadow:0 0 12px rgba(0,245,255,0.2)}
.empty{text-align:center;padding:32px 16px;color:#475569;border:1px dashed rgba(0,245,255,0.07);border-radius:10px;margin-top:7px}
.empty-icon{font-size:26px;margin-bottom:5px}.empty-t{font-size:11px;font-family:'JetBrains Mono',monospace}
.ftr{padding:4px 12px;border-top:1px solid rgba(0,245,255,0.06);background:rgba(1,3,8,0.95);display:flex;align-items:center;gap:7px;font-size:9px;color:#475569;flex-wrap:wrap;font-family:'JetBrains Mono',monospace}
.div{height:1px;background:rgba(0,245,255,0.06);margin:7px 0}
.bl-table{width:100%;border-collapse:collapse;font-size:11px}
.bl-table th{color:#475569;font-size:7px;text-transform:uppercase;letter-spacing:.5px;padding:3px 5px;text-align:left;border-bottom:1px solid rgba(0,245,255,0.06);font-family:'JetBrains Mono',monospace}
.bl-table td{padding:4px 5px;border-bottom:1px solid rgba(0,0,0,0.35);font-family:'JetBrains Mono',monospace}
.bl-table tr:hover td{background:rgba(239,68,68,0.04)}
.copy-btn{background:transparent;border:1px solid rgba(0,245,255,0.18);border-radius:4px;padding:2px 7px;cursor:pointer;color:#38bdf8;font-size:8px;font-weight:700;font-family:'JetBrains Mono',monospace;transition:all .15s;flex-shrink:0}
.copy-btn:hover{background:rgba(0,245,255,0.08);box-shadow:0 0 8px rgba(0,245,255,0.2)}
.copy-btn.copied{background:rgba(0,245,255,0.12);border-color:rgba(0,245,255,0.4);color:#00f5ff}
@media(max-width:480px){.hdr{padding:6px 8px}.body{padding:7px 7px}.sgrid{grid-template-columns:1fr}}
.neural-db{display:flex;flex-direction:column;gap:8px;height:calc(100vh - 115px);min-height:560px}
.neural-canvas-wrap{background:rgba(0,0,0,0.92);border:1px solid rgba(0,245,255,0.15);border-radius:12px;overflow:hidden;flex:0 0 auto;box-shadow:0 0 40px rgba(0,245,255,0.04),inset 0 0 80px rgba(0,0,0,0.5)}
.neural-ch{display:flex;align-items:center;gap:10px;padding:6px 14px;background:rgba(0,0,0,0.8);border-bottom:1px solid rgba(0,245,255,0.1)}
.neural-ch-title{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#00f5ff;letter-spacing:2px;text-transform:uppercase;text-shadow:0 0 12px rgba(0,245,255,0.5)}
.neural-panels{display:grid;grid-template-columns:2fr 2fr 1.4fr;gap:8px;flex:1;min-height:0;overflow:hidden}
.neural-zero-panel,.neural-live-panel,.neural-sw-panel{background:rgba(1,3,8,0.94);border:1px solid rgba(0,245,255,0.09);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;backdrop-filter:blur(8px)}
.neural-zero-panel{border-color:rgba(139,92,246,0.2);box-shadow:0 0 24px rgba(139,92,246,0.05)}
.nzero-hdr{padding:6px 12px;border-bottom:1px solid rgba(139,92,246,0.15);display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;color:#a78bfa;flex-shrink:0;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.nzero-wave{display:flex;align-items:flex-end;gap:1.5px;height:38px;padding:4px 12px 4px;background:rgba(0,0,0,0.5);flex-shrink:0;border-bottom:1px solid rgba(139,92,246,0.08)}
.nzero-bar{width:3px;background:linear-gradient(180deg,#c4b5fd,#7c3aed);border-radius:2px;animation:nwave 0.7s ease-in-out infinite;min-height:2px;box-shadow:0 0 5px rgba(139,92,246,0.6)}
@keyframes nwave{0%,100%{height:2px;opacity:.15}50%{height:26px;opacity:1}}
.nzero-text{padding:10px 12px;font-size:11px;color:#c4d4f0;font-style:italic;line-height:1.75;flex:1;overflow-y:auto;border-left:2px solid rgba(139,92,246,0.3)}
.nzero-hist-list{flex-shrink:0;max-height:80px;overflow-y:auto;border-top:1px solid rgba(139,92,246,0.1)}
.nzero-hist{padding:3px 12px;font-size:8px;color:#475569;border-bottom:1px solid rgba(0,0,0,0.4);line-height:1.5;font-family:'JetBrains Mono',monospace}
.nlive-hdr{padding:6px 12px;border-bottom:1px solid rgba(0,245,255,0.08);font-size:9px;font-weight:700;color:#38bdf8;display:flex;align-items:center;gap:6px;flex-shrink:0;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.nlive-events{overflow-y:auto;flex:1}
.nlive-row{display:flex;align-items:center;gap:5px;padding:3px 10px;border-bottom:1px solid rgba(0,0,0,0.4);font-size:9px;font-family:'JetBrains Mono',monospace;transition:background .1s}
.nlive-row:hover{background:rgba(0,245,255,0.03)}
.nlive-sym{font-weight:700;color:#c4d4f0;min-width:46px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nlive-mc{margin-left:auto;color:#38bdf8;white-space:nowrap;font-weight:600}
.wake-dot{width:6px;height:6px;border-radius:50%;background:#f97316;box-shadow:0 0 8px #f97316;animation:pulse-y .6s infinite;flex-shrink:0}
`;
