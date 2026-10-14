// Fallback image (simple silhouette) used if images/profile.jpg is missing
const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 460'>
      <rect width='360' height='460' fill='#d9d4dc'/>
      <circle cx='180' cy='170' r='70' fill='#a49caa'/>
      <ellipse cx='180' cy='400' rx='130' ry='110' fill='#a49caa'/>
    </svg>`
  );

const accent = (str) => str.replace(/\{(.+?)\}/g, '<span class="accent">$1</span>');

const $ = (id) => document.getElementById(id);

function setImage(el, src) {
    if(!el) return;
  el.src = src;
  el.onerror = () => {
    el.onerror = null;
    el.src = FALLBACK_IMG;
  };
}

/* ---------- RENDER ---------- */
function render(data) {
  // Sidebar
$("logo").innerHTML = accent(data.brand);
setImage($("sidebarImg"), data.avatar || data.about.image);

$("navLinks").innerHTML = data.nav
  .map(function (n) {
    return '<li><a href="' + n.href + '"><i class="bi ' + (n.icon || "bi-dot") + '"></i><span>' + n.label + "</span></a></li>";
  })
  .join("");
  
  // Hero
  $("heroGreeting").textContent = data.hero.greeting;
  $("heroTitle").innerHTML = accent(data.hero.title);
  $("heroText").textContent = data.hero.text;
  setImage($("heroImg"), data.hero.image);
  $("heroButtons").innerHTML = data.hero.buttons
    .map((b) => `<a href="${b.href}" class="btn ${b.style}">${b.label}</a>`)
    .join("");

  if ($("heroSocials")) {
    $("heroSocials").innerHTML = data.socials
      .map(
        (s) =>
          `<a href="${s.href}" title="${s.title}" aria-label="${s.title}">${s.label}</a>`
      )
      .join("");
  }

  // About
  $("aboutTitle").innerHTML = accent(data.about.title);
  $("aboutSubtitle").innerHTML = accent(data.about.subtitle);
  $("aboutText").textContent = data.about.text;
  setImage($("aboutImg"), data.about.image);
  $("aboutBtn").textContent = data.about.button.label;
  $("aboutBtn").href = data.about.button.href;

  // Projects (cards)
  $("skillsList").innerHTML = data.skills
    .map((s) => `<div class="card"><h4>${s.title}</h4><p>${s.text}</p></div>`)
    .join("");

  $("projectsList").innerHTML = data.projects
    .map(
      (p) => `<div class="card"><h4>${p.title}</h4><p>${p.text}</p><span class="tag">${p.tag}</span></div>`
    )
    .join("");

  // Experience & Education (timeline)
  const timeline = (items) =>
  items
    .map((i) => {
      const logo = i.logo
        ? '<img class="timeline-logo" src="' + i.logo + '" alt="' + i.place + ' logo" />'
        : "";
      return (
        '<div class="timeline-item">' +
        logo +
        '<div class="timeline-info">' +
        "<span>" + i.date + "</span>" +
        "<h4>" + i.title + " — " + i.place + "</h4>" +
        "<p>" + i.text + "</p>" +
        "</div></div>"
      );
    })
    .join("");

  $("researchList").innerHTML = timeline(data.research);
  $("educationList").innerHTML = timeline(data.education);

  // Contact form
  $("formFields").innerHTML = data.contact.fields
    .map((f) => {
      const req = f.required ? "required" : "";
      const input =
        f.type === "textarea"
          ? `<textarea name="${f.name}" placeholder="${f.placeholder}" ${req}></textarea>`
          : `<input type="${f.type}" name="${f.name}" placeholder="${f.placeholder}" ${req} />`;
      return `<div class="field">${input}<small>Please enter a valid ${f.placeholder.toLowerCase()}.</small></div>`;
    })
    .join("");
  $("formBtn").textContent = data.contact.button;

  // Footer
  var fs = $("footerSocials");
  if (fs) {
    fs.innerHTML = data.socials
      .map(function (s) {
        var title = (s.title || "").toLowerCase();
        var ext = s.href.indexOf("http") === 0 ? ' target="_blank" rel="noopener noreferrer"' : "";
        return (
          '<a href="' + s.href + '"' + ext + ' class="footer-social fi-' + title + '">' +
          '<i class="bi ' + (s.icon || "bi-link-45deg") + '"></i>' +
          '<span class="footer-text">' + (s.text || s.title || "") + "</span></a>"
        );
      })
      .join("");
  }
  if ($("copyright")) $("copyright").textContent = data.copyright;
}

/* ---------- MOBILE MENU ---------- */
function initMenu() {
  const btn = $("menuBtn");
  const nav = $("navbar");

  const toggle = (open) => {
    nav.classList.toggle("open", open);
    btn.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open);
  };

  btn.addEventListener("click", () => toggle(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) toggle(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) toggle(false);
  });
}

/* ---------- ACTIVE LINK ON SCROLL ---------- */
function initScrollSpy() {
  const links = [...document.querySelectorAll("#navLinks a")];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  const update = () => {
    const y = window.scrollY + 120;
    let current = sections[0];
    sections.forEach((s) => {
      if (s.offsetTop <= y) current = s;
    });
    links.forEach((a) =>
      a.classList.toggle("active", a.getAttribute("href") === `#${current.id}`)
    );
  };

  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* ---------- FORM VALIDATION ---------- */
function initForm(successText) {
  const form = $("contactForm");
  const msg = $("formMsg");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let valid = true;

    form.querySelectorAll(".field").forEach((field) => {
      const input = field.querySelector("input, textarea");
      const value = input.value.trim();
      let ok = !input.required || value !== "";
      if (ok && input.type === "email" && value) ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      field.classList.toggle("error", !ok);
      if (!ok) valid = false;
    });

    if (valid) {
      msg.textContent = successText;
      form.reset();
      setTimeout(() => (msg.textContent = ""), 4000);
    } else {
      msg.textContent = "";
    }
  });
}

/* ---------- INIT ---------- */
fetch("data.json")
  .then((res) => {
    if (!res.ok) throw new Error("Could not load data.json");
    return res.json();
  })
  .then((data) => {
    render(data);
    initMenu();
    initScrollSpy();
    initForm(data.contact.success);
  })
  .catch((err) => {
    console.error(err);
    document.querySelector("main").innerHTML =
      '<p style="padding:3rem;text-align:center">Could not load data.json. ' +
      "Open this project with a local server (e.g. VS Code Live Server) instead of double-clicking index.html.</p>";
  });
