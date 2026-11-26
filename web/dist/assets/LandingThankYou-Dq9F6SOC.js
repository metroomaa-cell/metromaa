import{a as e}from"./rolldown-runtime-BWaJ3C7D.js";import{A as t,I as n,L as r,P as i,R as a,U as o,V as s,k as c,w as l,z as u}from"./index-CJMFJfAv.js";var d=e(o(),1),f=t();function p({slug:e}){let[t,o]=(0,d.useState)(null),[p,m]=(0,d.useState)(``),[h,g]=(0,d.useState)(!1),[_,v]=(0,d.useState)(!1),[y,b]=(0,d.useState)(``),[x,S]=(0,d.useState)(``),[C,w]=(0,d.useState)(`Store`),[T,E]=(0,d.useState)(``),[D,O]=(0,d.useState)(``),[k,A]=(0,d.useState)(690),j=(0,d.useMemo)(()=>String(e||``).replace(/\/thankyou\/?$/i,``).replace(/^\/+|\/+$/g,``).trim(),[e]),M=(0,d.useMemo)(()=>typeof window>`u`?new URLSearchParams:new URLSearchParams(window.location.search),[]),N=M.get(`id`)||M.get(`orderId`)||``;(0,d.useEffect)(()=>{let e=null;try{let t=sessionStorage.getItem(`last_landing_order`);if(t){let n=JSON.parse(t);(!N||n.id===N||n.id?.includes(N))&&(e=n)}}catch{}e?o(e):N&&fetch(`/api/orders/public/${encodeURIComponent(N)}`).then(e=>e.ok?e.json():null).then(e=>{e&&e.id&&o(e)}).catch(()=>{})},[N]);let P=(0,d.useRef)(!1);(0,d.useEffect)(()=>{j&&fetch(`/api/landings/${encodeURIComponent(j)}`).then(e=>e.ok?e.json():null).then(e=>{if(e){if(e.whatsapp&&b(String(e.whatsapp).replace(/[^0-9]/g,``)),e.phone&&S(e.phone),E(e.headline||e.title||e.productTitle||``),O(e.heroImage||e.mainImage||e.packages&&e.packages[0]?.image||``),e.offerPrice&&A(Number(e.offerPrice)||690),e.fbPixelId){let t=String(e.fbPixelId).trim();e.pixelMode!==`both`&&s([t]),n(t)}e.ttkPixelId&&u(String(e.ttkPixelId).trim()),e.gtmId&&a(String(e.gtmId).trim()),e.gaId&&r(String(e.gaId).trim())}}).catch(()=>{}),l().then(e=>{e.whatsapp&&b(t=>t||String(e.whatsapp).replace(/[^0-9]/g,``)),e.phone&&S(t=>t||e.phone);let t=typeof window<`u`?window.location.hostname.toLowerCase():``;t.includes(`secrate`)?w(`Secrate`):t.includes(`metrroma`)||t.includes(`metromaa`)?w(`Metrroma`):t.includes(`timingboost`)?w(`TimeBoost`):e.storeName&&e.storeName!==`dot.`&&e.storeName!==`Dot Store`&&w(e.storeName)}).catch(()=>{})},[j]);let F=e=>{m(e),g(!0),setTimeout(()=>g(!1),2400)},I=t?.id||N||`ORD-`+Math.floor(1e5+Math.random()*9e5),L=()=>{let e=I.startsWith(`#`)?I:`#${I}`;navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(e).then(()=>{v(!0),F(`Order number copied: `+e),setTimeout(()=>v(!1),2e3)}).catch(()=>R(e)):R(e)},R=e=>{let t=document.createElement(`textarea`);t.value=e,t.style.position=`fixed`,t.style.opacity=`0`,document.body.appendChild(t),t.select();try{document.execCommand(`copy`),v(!0),F(`Order number copied: `+e),setTimeout(()=>v(!1),2e3)}catch{}document.body.removeChild(t)},z=(0,d.useMemo)(()=>{let e=new Date,t=new Date(e.getTime()+1728e5),n=new Date(e.getTime()+2592e5),r={weekday:`short`,day:`numeric`,month:`short`};return`${t.toLocaleDateString(`en-GB`,r)} – ${n.toLocaleDateString(`en-GB`,r)}`},[]),B=(0,d.useMemo)(()=>t&&Array.isArray(t.items)&&t.items.length>0?t.items:[{id:`item-1`,name:T||`Winter Knitted Hooded Scarf & Cap`,title:T||`Winter Knitted Hooded Scarf & Cap`,price:k,qty:1,color:t?.color||`Standard`,image:D}],[t,T,k,D]),V=t?.subtotal==null?B.reduce((e,t)=>e+(Number(t.price)||0)*(Number(t.qty)||1),0):t.subtotal,H=t?.shippingCost==null?t?.total?Math.max(0,t.total-V):80:t.shippingCost,U=t?.total==null?V+H:t.total;(0,d.useEffect)(()=>{let e=t?.id||N;if(!e||P.current)return;let n=`ty_purchase_fired_${e}`;try{if(sessionStorage.getItem(n)===`1`){P.current=!0;return}sessionStorage.setItem(n,`1`)}catch{}P.current=!0;let r=B.map((e,t)=>({id:String(e.id||j||`item_${t+1}`),name:String(e.name||e.title||T||`Product`),price:Number(e.price)||k,qty:Number(e.qty)||1}));i(e,U,r,`landing_${j}`,{name:t?.name,phone:t?.phone,address:t?.address})},[t,N,U,B,j,T,k]);let W=y.replace(/[^0-9]/g,``)||`8801700000000`,G=x||`+880 1700-000000`,K=x.replace(/[^0-9+]/g,``)||`+8801700000000`,q=`https://wa.me/${W}?text=${encodeURIComponent(`আসসালামু আলাইকুম, আমি অর্ডার #${I} সংক্রান্ত তথ্য জানতে চাচ্ছি।`)}`;return(0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)(`style`,{children:`
        :root {
          --bg: #F7F5F2;
          --surface: #FFFFFF;
          --surface-2: #FBFAF8;
          --text: #161616;
          --muted: #6B6560;
          --faint: #9A948D;
          --line: #E9E3DB;
          --line-strong: #DDD5C8;
          --green: #0E4D2E;
          --green-bg: #EAF3ED;
          --green-dot: #177245;
          --gold: #B9975B;
          --gold-soft: #F3EAD8;
          --black: #111111;
          --black-text: #FFFFFF;
          --shadow: 0 20px 50px rgba(22,18,10,.07), 0 2px 10px rgba(22,18,10,.04);
          --radius: 22px;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #0F0F0F;
            --surface: #171717;
            --surface-2: #1C1C1C;
            --text: #F2EFEA;
            --muted: #A8A29A;
            --faint: #7A756E;
            --line: #2A2A2A;
            --line-strong: #33302B;
            --green: #8ED0A6;
            --green-bg: #16281E;
            --green-dot: #4CC07A;
            --gold: #D2B078;
            --gold-soft: #2A2418;
            --black: #F2EFEA;
            --black-text: #111111;
            --shadow: 0 20px 50px rgba(0,0,0,.35);
          }
        }
        .thankyou-wrapper {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: "Manrope", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          line-height: 1.5;
        }
        .top-line { height: 3px; background: var(--gold); }
        .wrap { max-width: 720px; margin: 0 auto; padding: 28px 20px 40px; }
        @media (min-width: 640px) { .wrap { padding: 44px 24px 56px; } }
        
        .hero { text-align: center; padding: 10px 6px 8px; }
        .check-wrap {
          width: 78px; height: 78px; margin: 0 auto 20px; border-radius: 50%;
          background: var(--green-bg);
          display: grid; place-items: center;
          border: 1px solid var(--line);
          position: relative;
        }
        .check-wrap::after {
          content: ""; position: absolute; inset: -9px; border-radius: 50%;
          border: 1px solid var(--line);
        }
        .check-svg { width: 38px; height: 38px; }
        .check-circle {
          stroke: var(--green-dot); stroke-width: 2.2; fill: none;
          stroke-dasharray: 166; stroke-dashoffset: 166;
          animation: stroke 0.7s cubic-bezier(.65,0,.35,1) forwards;
        }
        .check-mark {
          stroke: var(--green-dot); stroke-width: 3; fill: none;
          stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 48; stroke-dashoffset: 48;
          animation: stroke 0.45s 0.55s cubic-bezier(.65,0,.35,1) forwards;
        }
        @keyframes stroke { to { stroke-dashoffset: 0; } }

        .eyebrow {
          font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
          font-weight: 800; color: var(--gold); margin: 0 0 10px;
        }
        h1.thankyou-title {
          font-family: "DM Serif Display", Georgia, serif;
          font-weight: 400;
          font-size: clamp(36px, 7vw, 50px);
          line-height: .98; letter-spacing: -.02em; margin: 0;
        }
        h1.thankyou-title em { font-style: italic; color: var(--green); }
        .hero p.lead {
          margin: 14px auto 0; max-width: 520px;
          font-size: 16px; line-height: 1.6; color: var(--muted); font-weight: 500;
        }
        .hero p.bn {
          margin: 8px auto 0; font-size: 15px; color: var(--faint); font-weight: 500;
        }

        .order-pill {
          margin: 22px auto 0; display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
          background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
          padding: 8px 8px 8px 16px; box-shadow: var(--shadow);
        }
        .order-pill span.label { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; font-weight: 800; color: var(--faint); }
        .order-pill strong { font-family: "JetBrains Mono", monospace; font-size: 14px; letter-spacing: .02em; }
        .copy-btn {
          min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line);
          background: var(--surface-2); font-weight: 700; font-size: 13px; color: var(--text);
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: transform 0.1s;
        }
        .copy-btn:active { transform: scale(0.97); }

        .card {
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow); margin-top: 22px; overflow: hidden; text-align: left;
        }
        .card-head {
          padding: 18px 20px 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px;
          border-bottom: 1px solid var(--line);
        }
        @media(min-width:640px){ .card-head{padding:20px 24px 16px} .card-body{padding:6px 24px 20px !important} }
        .card-head h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin: 0; font-weight: 800; }
        .badge {
          font-size: 12px; font-weight: 800; padding: 6px 10px; border-radius: 999px;
          background: var(--green-bg); color: var(--green); white-space: nowrap;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--green-dot); display: block; }
        .card-body { padding: 6px 20px 18px; }

        .item { display: flex; gap: 16px; padding: 18px 0 16px; border-bottom: 1px dashed var(--line-strong); align-items: center; }
        .thumb {
          width: 72px; height: 72px; flex: 0 0 72px; border-radius: 14px;
          background: linear-gradient(145deg,#1F1F1F,#3A3A3A);
          display: grid; place-items: center; position: relative; overflow: hidden;
        }
        .thumb img { width: 100%; height: 100%; object-fit: cover; }
        .thumb::after { content: ""; position: absolute; inset: auto -10px -18px -10px; height: 28px; background: rgba(255,255,255,.08); transform: rotate(-8deg); }
        .thumb span { font-family: "DM Serif Display", serif; color: #EADFC6; font-size: 26px; line-height: 1; }
        .item-info { flex: 1; min-width: 0; }
        .item-info h3 { margin: 0; font-size: 16px; line-height: 1.3; font-weight: 800; letter-spacing: -.01em; }
        .item-info p { margin: 5px 0 0; font-size: 13.5px; color: var(--muted); font-weight: 500; line-height: 1.5; }
        .item-price { text-align: right; }
        .item-price strong { font-size: 16px; font-weight: 800; }
        .item-price p { margin: 3px 0 0; font-size: 12.5px; color: var(--faint); font-weight: 600; }

        .totals { padding: 14px 0 2px; }
        .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: 14.5px; font-weight: 600; color: var(--muted); }
        .row span:last-child { color: var(--text); font-weight: 700; }
        .row.total { margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 15px; color: var(--text); }
        .row.total span:last-child { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
        .cod {
          margin-top: 14px; background: var(--gold-soft); border: 1px solid var(--line);
          border-radius: 12px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start;
          font-size: 13.5px; line-height: 1.55; font-weight: 600;
        }
        .cod b { font-weight: 800; }

        .timeline {
          margin-top: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow); padding: 20px 20px 18px; text-align: left;
        }
        @media(min-width:640px){ .timeline{padding:22px 24px 20px} }
        .timeline-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .timeline-head h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin: 0; font-weight: 800; }
        .timeline-head p { margin: 0; font-size: 13.5px; color: var(--muted); font-weight: 600; }
        .timeline-head p b { color: var(--text); }
        .steps { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0; margin-top: 20px; position: relative; }
        .steps::before { content: ""; position: absolute; top: 15px; left: 12%; right: 12%; height: 2px; background: var(--line); }
        .steps::after { content: ""; position: absolute; top: 15px; left: 12%; width: 12%; height: 2px; background: var(--green-dot); }
        .step { text-align: center; position: relative; padding: 0 4px; }
        .step .dot {
          width: 32px; height: 32px; margin: 0 auto; border-radius: 50%; background: var(--surface);
          border: 2px solid var(--line-strong); display: grid; place-items: center; font-size: 13px; position: relative; z-index: 1;
        }
        .step.done .dot { background: var(--green-dot); border-color: var(--green-dot); color: #fff; }
        .step.current .dot { border-color: var(--green-dot); color: var(--green-dot); background: var(--green-bg); font-weight: 800; }
        .step p { margin: 8px 0 0; font-size: 12px; line-height: 1.35; font-weight: 700; color: var(--muted); }
        .step.done p, .step.current p { color: var(--text); }
        .step small { display: block; margin-top: 2px; font-size: 11px; color: var(--faint); font-weight: 600; }

        .next { display: grid; gap: 12px; margin-top: 22px; text-align: left; }
        @media(min-width:640px){ .next { grid-template-columns: 1fr 1fr 1fr; } }
        .next-item { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
        .next-item .num {
          width: 28px; height: 28px; border-radius: 50%; background: var(--text); color: var(--bg);
          display: grid; place-items: center; font-size: 13px; font-weight: 800; margin-bottom: 10px;
        }
        @media (prefers-color-scheme: dark){ .next-item .num { background: var(--gold); color: #111; } }
        .next-item h3 { margin: 0; font-size: 14.5px; font-weight: 800; }
        .next-item p { margin: 6px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--muted); font-weight: 500; }

        .actions { display: grid; gap: 10px; margin-top: 22px; }
        @media(min-width:560px){ .actions { grid-template-columns: 1.2fr .8fr; } }
        .btn {
          min-height: 52px; border-radius: 999px; padding: 0 20px;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 15px; font-weight: 800; text-decoration: none; border: 1px solid transparent;
          transition: transform .15s ease, opacity .15s ease; cursor: pointer;
        }
        .btn:active { transform: scale(.985); }
        .btn-primary { background: var(--black); color: var(--black-text); }
        .btn-secondary { background: transparent; color: var(--text); border-color: var(--line-strong); }
        .btn svg { width: 18px; height: 18px; flex: 0 0 18px; }

        .help {
          margin-top: 22px; text-align: center; padding: 18px 16px; border: 1px dashed var(--line-strong); border-radius: 16px;
        }
        .help p { margin: 0; font-size: 14px; color: var(--muted); font-weight: 600; line-height: 1.6; }
        .help-links { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
        .help-links a {
          min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface);
          display: inline-flex; align-items: center; font-size: 13.5px; font-weight: 700; text-decoration: none; color: var(--text);
        }

        footer.thankyou-footer { margin-top: 28px; text-align: center; padding-bottom: 20px; }
        footer.thankyou-footer p { margin: 0; font-size: 12.5px; color: var(--faint); font-weight: 600; letter-spacing: .02em; line-height: 1.7; }
        footer.thankyou-footer strong { color: var(--muted); letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }

        .toast {
          position: fixed; left: 50%; bottom: 22px; transform: translate(-50%, 16px);
          background: #111; color: #fff; padding: 11px 16px; border-radius: 999px;
          font-size: 13.5px; font-weight: 700; opacity: 0; pointer-events: none; transition: .25s ease; z-index: 999;
          box-shadow: 0 10px 30px rgba(0,0,0,.25); white-space: nowrap;
        }
        @media (prefers-color-scheme: dark){ .toast { background: #F2EFEA; color: #111; } }
        .toast.show { opacity: 1; transform: translate(-50%, 0); }
      `}),(0,f.jsxs)(`div`,{translate:`no`,className:`thankyou-wrapper notranslate`,children:[(0,f.jsx)(`div`,{className:`top-line`}),(0,f.jsxs)(`main`,{className:`wrap`,children:[(0,f.jsxs)(`section`,{className:`hero`,"aria-label":`Order confirmed`,children:[(0,f.jsx)(`div`,{className:`check-wrap`,"aria-hidden":`true`,children:(0,f.jsxs)(`svg`,{className:`check-svg`,viewBox:`0 0 52 52`,fill:`none`,children:[(0,f.jsx)(`circle`,{className:`check-circle`,cx:`26`,cy:`26`,r:`24`}),(0,f.jsx)(`path`,{className:`check-mark`,d:`M14 27l8 8 16-16`})]})}),(0,f.jsx)(`p`,{className:`eyebrow`,children:`Order Confirmed`}),(0,f.jsxs)(`h1`,{className:`thankyou-title`,children:[`Thank you for`,(0,f.jsx)(`br`,{}),(0,f.jsx)(`em`,{children:`your order.`})]}),(0,f.jsx)(`p`,{className:`lead`,children:`Your order has been received and is being prepared with care. We’ll call to confirm shortly — please keep your phone nearby.`}),(0,f.jsx)(`p`,{className:`bn`,children:`আপনার অর্ডারটি সফলভাবে গৃহীত হয়েছে। ধন্যবাদ!`}),(0,f.jsxs)(`div`,{className:`order-pill`,children:[(0,f.jsx)(`span`,{className:`label`,children:`Order`}),(0,f.jsxs)(`strong`,{children:[`#`,I]}),(0,f.jsxs)(`button`,{className:`copy-btn`,onClick:L,type:`button`,"aria-label":`Copy order number`,children:[(0,f.jsxs)(`svg`,{width:`14`,height:`14`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,strokeLinecap:`round`,strokeLinejoin:`round`,children:[(0,f.jsx)(`rect`,{x:`9`,y:`9`,width:`13`,height:`13`,rx:`2`}),(0,f.jsx)(`path`,{d:`M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1`})]}),(0,f.jsx)(`span`,{children:_?`Copied ✓`:`Copy`})]})]})]}),(0,f.jsxs)(`section`,{className:`card`,"aria-label":`Order summary`,children:[(0,f.jsxs)(`div`,{className:`card-head`,children:[(0,f.jsx)(`h2`,{children:`Order Summary`}),(0,f.jsxs)(`span`,{className:`badge`,children:[(0,f.jsx)(`i`,{}),` Confirmed`]})]}),(0,f.jsxs)(`div`,{className:`card-body`,children:[B.map((e,t)=>{let n=e.name||e.title||T||`Product Package`,r=n.charAt(0).toUpperCase()||`S`,i=Number(e.price)||0,a=Number(e.qty)||1;return(0,f.jsxs)(`div`,{className:`item`,children:[(0,f.jsx)(`div`,{className:`thumb`,"aria-hidden":`true`,children:e.image?(0,f.jsx)(`img`,{src:e.image,alt:n}):(0,f.jsx)(`span`,{children:r})}),(0,f.jsxs)(`div`,{className:`item-info`,children:[(0,f.jsx)(`h3`,{children:n}),(0,f.jsxs)(`p`,{children:[e.color&&(0,f.jsxs)(f.Fragment,{children:[`Colour: `,(0,f.jsx)(`b`,{style:{color:`var(--text)`},children:e.color}),` \xA0·\xA0`,` `]}),`Qty `,a,` `,e.variantTitle?`· ${e.variantTitle}`:``]})]}),(0,f.jsxs)(`div`,{className:`item-price`,children:[(0,f.jsxs)(`strong`,{children:[`৳`,(i*a).toLocaleString()]}),(0,f.jsxs)(`p`,{children:[`৳`,i,` each`]})]})]},e.id||t)}),(0,f.jsxs)(`div`,{className:`totals`,children:[(0,f.jsxs)(`div`,{className:`row`,children:[(0,f.jsx)(`span`,{children:`Subtotal`}),(0,f.jsxs)(`span`,{children:[`৳`,V.toLocaleString()]})]}),(0,f.jsxs)(`div`,{className:`row`,children:[(0,f.jsx)(`span`,{children:`Delivery charge`}),(0,f.jsxs)(`span`,{children:[`৳`,H.toLocaleString()]})]}),(0,f.jsxs)(`div`,{className:`row total`,children:[(0,f.jsx)(`span`,{children:`Total to pay`}),(0,f.jsxs)(`span`,{children:[`৳`,U.toLocaleString()]})]})]}),(0,f.jsxs)(`div`,{className:`cod`,children:[(0,f.jsxs)(`svg`,{width:`18`,height:`18`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,style:{flex:`0 0 18px`,marginTop:1},children:[(0,f.jsx)(`rect`,{x:`2`,y:`6`,width:`20`,height:`12`,rx:`2`}),(0,f.jsx)(`circle`,{cx:`12`,cy:`12`,r:`2`}),(0,f.jsx)(`path`,{d:`M6 12h.01M18 12h.01`})]}),(0,f.jsxs)(`div`,{children:[(0,f.jsx)(`b`,{children:`Cash on Delivery.`}),` Pay `,(0,f.jsxs)(`b`,{children:[`৳`,U.toLocaleString()]}),` in cash when your parcel arrives. Please check the product in front of the delivery person.`]})]})]})]}),(0,f.jsxs)(`section`,{className:`timeline`,id:`tracking`,"aria-label":`Delivery progress`,children:[(0,f.jsxs)(`div`,{className:`timeline-head`,children:[(0,f.jsx)(`h2`,{children:`Delivery Progress`}),(0,f.jsxs)(`p`,{children:[`Estimated delivery: `,(0,f.jsx)(`b`,{children:z})]})]}),(0,f.jsxs)(`div`,{className:`steps`,children:[(0,f.jsxs)(`div`,{className:`step done`,children:[(0,f.jsx)(`div`,{className:`dot`,children:`✓`}),(0,f.jsxs)(`p`,{children:[`Order placed`,(0,f.jsx)(`small`,{children:`Today`})]})]}),(0,f.jsxs)(`div`,{className:`step current`,children:[(0,f.jsx)(`div`,{className:`dot`,children:`2`}),(0,f.jsxs)(`p`,{children:[`Processing`,(0,f.jsx)(`small`,{children:`Packing now`})]})]}),(0,f.jsxs)(`div`,{className:`step`,children:[(0,f.jsx)(`div`,{className:`dot`,children:`3`}),(0,f.jsxs)(`p`,{children:[`Shipped`,(0,f.jsx)(`small`,{children:`On the way`})]})]}),(0,f.jsxs)(`div`,{className:`step`,children:[(0,f.jsx)(`div`,{className:`dot`,children:`4`}),(0,f.jsxs)(`p`,{children:[`Delivered`,(0,f.jsx)(`small`,{children:`At your door`})]})]})]})]}),(0,f.jsxs)(`section`,{className:`next`,"aria-label":`What happens next`,children:[(0,f.jsxs)(`article`,{className:`next-item`,children:[(0,f.jsx)(`div`,{className:`num`,children:`1`}),(0,f.jsx)(`h3`,{children:`Confirmation call`}),(0,f.jsx)(`p`,{children:`Our team will call you within a few hours to confirm your address and delivery time.`})]}),(0,f.jsxs)(`article`,{className:`next-item`,children:[(0,f.jsx)(`div`,{className:`num`,children:`2`}),(0,f.jsx)(`h3`,{children:`Packed & shipped`}),(0,f.jsx)(`p`,{children:`Your parcel is quality-checked, carefully packed, and handed to the courier. You’ll get an SMS update.`})]}),(0,f.jsxs)(`article`,{className:`next-item`,children:[(0,f.jsx)(`div`,{className:`num`,children:`3`}),(0,f.jsx)(`h3`,{children:`Pay at your door`}),(0,f.jsx)(`p`,{children:`Receive your parcel in 2–3 days and pay in cash. Easy exchange if there’s any issue.`})]})]}),(0,f.jsxs)(`div`,{className:`actions`,children:[(0,f.jsxs)(`button`,{className:`btn btn-primary`,onClick:()=>{document.getElementById(`tracking`)?.scrollIntoView({behavior:`smooth`}),F(`Your order is being packed — step 2 of 4`)},type:`button`,children:[(0,f.jsxs)(`svg`,{viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,strokeLinecap:`round`,strokeLinejoin:`round`,children:[(0,f.jsx)(`path`,{d:`M21 8l-2 8H5L3 4H1`}),(0,f.jsx)(`circle`,{cx:`9`,cy:`20`,r:`1`}),(0,f.jsx)(`circle`,{cx:`17`,cy:`20`,r:`1`}),(0,f.jsx)(`path`,{d:`M12 2v4M8 6h8`})]}),`Track My Order`]}),(0,f.jsxs)(`button`,{className:`btn btn-secondary`,onClick:()=>{c(j?`page/${j}`:``)},type:`button`,children:[`Continue Shopping`,(0,f.jsx)(`svg`,{viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:`2`,strokeLinecap:`round`,strokeLinejoin:`round`,children:(0,f.jsx)(`path`,{d:`M5 12h14M13 6l6 6-6 6`})})]})]}),(0,f.jsxs)(`section`,{className:`help`,"aria-label":`Need help`,children:[(0,f.jsxs)(`p`,{children:[`Need to change your address or colour?`,(0,f.jsx)(`br`,{}),`Message us — we’ll fix it before your order ships.`]}),(0,f.jsxs)(`div`,{className:`help-links`,children:[(0,f.jsx)(`a`,{href:q,target:`_blank`,rel:`noopener noreferrer`,children:`💬 WhatsApp Us`}),(0,f.jsxs)(`a`,{href:`tel:${K}`,children:[`📞 Call `,G]})]})]}),(0,f.jsx)(`footer`,{className:`thankyou-footer`,children:(0,f.jsxs)(`p`,{children:[(0,f.jsx)(`strong`,{children:C}),(0,f.jsx)(`br`,{}),`Thank you for shopping with us · A confirmation SMS has been sent to your phone`]})})]}),(0,f.jsx)(`div`,{className:`toast ${h?`show`:``}`,role:`status`,"aria-live":`polite`,children:p})]},`ty-wrapper`)]})}export{p as LandingThankYou};