# iteration_39: extract generated PDF HTML from PdfPreviewModal on web (WebView unsupported on web -> read React fiber props.source.html)
FIBER_HTML_JS = """()=>{
 const el=[...document.querySelectorAll('div')].find(d=>d.children.length===0&&d.textContent.includes('React Native WebView does not support'));
 if(!el) return 'NO_WEBVIEW_EL';
 const k=Object.keys(el).find(k=>k.startsWith('__reactFiber'));
 let f=el[k];
 for(let i=0;i<40&&f;i++){ const p=f.memoizedProps; if(p&&p.source&&p.source.html) return p.source.html; f=f.return; }
 return 'NO_HTML';
}"""
