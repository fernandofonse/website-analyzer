document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Extract and render main SEO data
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: extractMainSEOData,
    },
    (results) => {
      if (results && results[0] && results[0].result) {
        const mainData = results[0].result;
        renderMainInfo(mainData);

        // Extract and render additional SEO data asynchronously
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: extractAdditionalSEOData,
          },
          (additionalResults) => {
            if (additionalResults && additionalResults[0] && additionalResults[0].result) {
              renderAsyncData({ ...mainData, ...additionalResults[0].result });
              initTabs();
              initToggles();
            } else {
              document.getElementById('main').innerHTML += '<p>Failed to fetch additional SEO data.</p>';
            }
          }
        );
      } else {
        document.getElementById('main').innerHTML = '<p>Failed to fetch main SEO data.</p>';
      }
    }
  );
});

function extractMainSEOData() {
  return {
    title: document.title || '',
    titleLength: document.title.length || 0,
    description: document.querySelector('meta[name="description"]')?.content || '',
    descriptionLength: (document.querySelector('meta[name="description"]')?.content || '').length,
    url: window.location.href,
    canonical: document.querySelector('link[rel="canonical"]')?.href || ''
  };
}

function extractAdditionalSEOData() {
  const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
    tag: h.tagName,
    text: h.textContent.trim(),
  }));

  // Flagging headings that are out of hierarchy
  const flaggedHeaders = [];
  let lastLevel = 0; // Initialize to 0 which is before any heading level
  headers.forEach(header => {
    const currentLevel = parseInt(header.tag[1]);
    if (currentLevel > lastLevel + 1) {
      flaggedHeaders.push(header);
    }
    lastLevel = currentLevel;
  });

  const images = Array.from(document.querySelectorAll('img'));
  const imagesWithoutAlt = images.filter(img => !img.hasAttribute('alt')).map(img => img.src);
  const imagesNotWebP = images.filter(img => !img.src.endsWith('.webp')).map(img => img.src);
  const imagesWithoutSize = images
    .filter(img => !img.hasAttribute('width') || !img.hasAttribute('height'))
    .map(img => img.src);

  // Parallelizing the requests for robots.txt and sitemap.xml
  const robotsTxt = fetch('/robots.txt').then(response => (response.ok ? response.text() : '')).catch(() => '');
  const sitemapUrls = ['/sitemap.xml', '/sitemap_index.xml'];

  // Create promises for sitemap check
  const sitemapPromises = sitemapUrls.map(url => {
    return fetch(url).then(res => (res.ok ? url : '')).catch(() => '');
  });

  return Promise.all([robotsTxt, ...sitemapPromises]).then(results => {
    const robots = results[0];
    const sitemap = results.slice(1).find(s => s) || '';
    const sitemapMentioned = sitemapUrls.some(url => robots.includes(url));

    return {
      headers,
      flaggedHeaders,
      imagesWithAlt: images.length - imagesWithoutAlt.length,
      imagesWithoutAlt,
      imagesNotWebP,
      imagesWithoutSize,
      robots,
      sitemap: sitemap || '',
      sitemapMentioned,
    };
  });
}

function renderMainInfo(data) {
  const titleClass = data.titleLength >= 50 && data.titleLength <= 60 ? 'green' : 'red';
  const titleRecommendation = ' (Recommended: 50–60 characters)';
  const descClass = data.descriptionLength >= 150 && data.descriptionLength <= 160 ? 'green' : 'red';
  const descRecommendation = ' (Recommended: 150–160 characters)';

  document.getElementById('main').innerHTML = `
    <div class="info">
      <h2>Title</h2>
      <p>${data.title}</p>
      <p>
        <span class="${titleClass}">${data.titleLength} characters</span>${titleRecommendation}
      </p>
    </div>
    <div class="info">
      <h2>Description</h2>
      <p>${data.description}</p>
      <p>
        <span class="${descClass}">${data.descriptionLength} characters</span>${descRecommendation}
      </p>
    </div>
    <div class="info">
      <h2>URL</h2>
      <p><a href="${data.url}" target="_blank">${data.url}</a></p>
    </div>
    <div class="info">
      <h2>Canonical URL</h2>
      <p><a href="${data.canonical}" target="_blank">${data.canonical}</a></p>
    </div>
  `;
}

function renderAsyncData(data) {
  const currentDomain = new URL(data.url).origin;

  // Robots.txt and Sitemap Section
  document.getElementById('main').insertAdjacentHTML('beforeend', `
    <div class="info">
      <h2>Robots.txt</h2>
      ${data.robots.trim()
        ? `<pre>${data.robots}</pre>`
        : `<p><span class="red">Robots.txt not found</span></p>`}
      ${data.sitemapMentioned
        ? ''
        : `<p><span class="red">Sitemap is not mentioned.</span></p>`}
    </div>
    <div class="info">
      <h2>Sitemap</h2>
      <p>${data.sitemap 
        ? `<a href="${currentDomain}${data.sitemap}" target="_blank">${currentDomain}${data.sitemap}</a>` 
        : '<span class="red">No sitemap found.</span>'}</p>
    </div>
  `);

  // Headers Section with Flagging of Wrong Hierarchy
  document.getElementById('headers').innerHTML = `
    <div class="info">
      <h2>Headers</h2>
      <ul>
        ${data.headers.map((h, index) => `
          <li style="margin-left: ${(parseInt(h.tag[1]) - 1) * 20}px; color: ${data.flaggedHeaders.some(fh => fh.tag === h.tag && fh.text === h.text) ? 'red' : 'inherit'};">
            <strong>${h.tag}:</strong> ${h.text}
            ${data.flaggedHeaders.some(fh => fh.tag === h.tag && fh.text === h.text) ? '<span class="red"> (Out of hierarchy)</span>' : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  // Images Section
  const altColorClass = data.imagesWithoutAlt.length ? 'red' : '#4caf50';
  const webpColorClass = data.imagesNotWebP.length ? 'red' : '#4caf50';
  const sizeColorClass = data.imagesWithoutSize.length ? 'red' : '#4caf50';

  document.getElementById('images').innerHTML = `
    <div class="info">
      <h2>Images with ALT</h2>
      <p>Total: <strong>${data.imagesWithAlt}</strong></p>
    </div>
    <div class="info">
      <h2 style="color: ${altColorClass}">Images without ALT</h2>
      <p>Total: <strong>${data.imagesWithoutAlt.length}</strong></p>
      <button class="toggle-button" data-target="imagesWithoutAltList">Show/Hide URLs</button>
      <ul class="dropdown-list" id="imagesWithoutAltList">
        ${data.imagesWithoutAlt.map((img, i) => `<li>${i+1}. <a href="${img}" target="_blank">${img}</a></li>`).join('')}
      </ul>
    </div>
    <div class="info">
      <h2 style="color: ${webpColorClass}">Images Not in WebP Format</h2>
      <p>Total: <strong>${data.imagesNotWebP.length}</strong></p>
      <button class="toggle-button" data-target="imagesNotWebPList">Show/Hide URLs</button>
      <ul class="dropdown-list" id="imagesNotWebPList">
        ${data.imagesNotWebP.map((img, i) => `<li>${i+1}. <a href="${img}" target="_blank">${img}</a></li>`).join('')}
      </ul>
    </div>
    <div class="info">
      <h2 style="color: ${sizeColorClass}">Images Without Explicit Width and Height</h2>
      <p>Total: <strong>${data.imagesWithoutSize.length}</strong></p>
      <button class="toggle-button" data-target="imagesWithoutSizeList">Show/Hide URLs</button>
      <ul class="dropdown-list" id="imagesWithoutSizeList">
        ${data.imagesWithoutSize.map((img, i) => `<li>${i+1}. <a href="${img}" target="_blank">${img}</a></li>`).join('')}
      </ul>
    </div>
  `;
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

function initToggles() {
  document.querySelectorAll('.toggle-button').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.target);
      target.style.display = target.style.display === 'block' ? 'none' : 'block';
    });
  });
}