# PLUS-0122.github.io

Personal homepage of **Jiahao Fan**, deployed with **GitHub Pages**.

- Live site: <https://plus-0122.github.io/>
- Served over HTTPS from the `main` branch root (`https_enforced` is on)
- Source for CSI205TC (Networking and Distributed Computing) Coursework 1, Question 2

## Structure

```
index.html          page markup: hero, lanyard stage, footer
style.css           layout, typography (Playfair Display / Instrument Serif), responsive rules
script.js           deferred bootstrap that loads the 3D badge module
js/badge3d.js       interactive lanyard badge (three.js renderer + Rapier physics)
vendor/             pinned three.js and Rapier ES-module builds
assets/             card textures, web fonts, favicon, social card
404.html            custom not-found page
robots.txt          crawler policy
sitemap.xml         single-page sitemap
```

## Deployment

Every push to `main` triggers a GitHub Pages build (legacy branch build), which
publishes the site to the four GitHub Pages CDN addresses
(185.199.108.153 – 185.199.111.153). The site is plain static HTML/CSS/JS, so
no build step is required.
