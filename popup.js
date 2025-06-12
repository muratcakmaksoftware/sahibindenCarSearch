// Chrome API'lerinin hazır olmasını bekle
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // API'lerin yüklendiğinden emin ol
    const requiredApis = ['scripting', 'tabs'];
    const missingApis = requiredApis.filter(api => !chrome[api]);

    if (missingApis.length > 0) {
      throw new Error(`Eksik API'ler: ${missingApis.join(', ')}`);
    }

    // İzinleri kontrol et
    const response = await chrome.runtime.sendMessage({ checkPermissions: true });
    console.log('İzin durumu:', response);

    const progress = document.getElementById('progress');
    const progressCount = document.getElementById('progressCount');
    const currentPage = document.getElementById('currentPage');
    const totalPages = document.getElementById('totalPages');
    const results = document.getElementById('results');
    const startButton = document.getElementById('startAnalysis');
    const pageLimitInput = document.getElementById('pageLimit');
    const jsonFileInput = document.getElementById('jsonFileInput');
    const viewReportButton = document.getElementById('viewReport');
    const downloadSection = document.getElementById('downloadSection');
    const downloadReportButton = document.getElementById('downloadReport');
    
    // JSON dosyası seçildiğinde
    let analyzedData = null;
    jsonFileInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        try {
          const fileContent = await file.text();
          analyzedData = JSON.parse(fileContent);
          viewReportButton.disabled = false;
        } catch (error) {
          console.error('JSON dosyası okuma hatası:', error);
          alert('JSON dosyası okunamadı veya geçersiz format!');
          viewReportButton.disabled = true;
          analyzedData = null;
        }
      } else {
        viewReportButton.disabled = true;
        analyzedData = null;
      }
    });

    // Raporu Gör butonuna tıklandığında
    viewReportButton.addEventListener('click', async () => {
      if (analyzedData) {
        await chrome.runtime.sendMessage({ 
          action: 'showReport', 
          data: analyzedData
        });
      }
    });
    
    // İndirme butonu tıklama olayı
    downloadReportButton.addEventListener('click', async () => {
      try {
        if (window.analysisData) {
          // Rapor verisini oluştur
          const reportData = {
            analyzedCars: window.analysisData.analyzedCars,
            searchFilters: window.analysisData.searchFilters,
            analysisDate: new Date().toLocaleString('tr-TR'),
            stats: window.analysisData.stats
          };

          console.log('Sending report data:', reportData);
          
          // Raporu indir
          await chrome.runtime.sendMessage({ 
            action: 'showReport',
            data: reportData
          });
        } else {
          console.error('Analiz verisi bulunamadı');
        }
      } catch (error) {
        console.error('Rapor indirme hatası:', error);
      }
    });
    
    // İlerleme durumunu kontrol et
    const checkProgress = async () => {
      const response = await chrome.runtime.sendMessage({ 
        action: 'getProgress',
        pageLimit: parseInt(pageLimitInput.value) || 0
      });
      console.log('İlerleme durumu:', response);
      
      if (response.isRunning) {
        progress.style.display = 'block';
        progressCount.textContent = response.totalProcessed;
        
        // Sayfa gösterimini düzenli formatta güncelle
        pageDisplay = `${response.currentPage} / ${response.totalPages}`;
        
        currentPage.textContent = response.currentPage;
        totalPages.textContent = pageDisplay.replace(response.currentPage + ' / ', '');
        
        startButton.textContent = 'Analizi Durdur';
        startButton.classList.add('running');
        
        // Otomatik güncelleme için interval başlat
        if (!window.progressInterval) {
          window.progressInterval = setInterval(checkProgress, 2000);
        }
      } else {
        progress.style.display = 'none';
        startButton.textContent = 'Analizi Başlat';
        startButton.classList.remove('running');
        
        // Interval'i temizle
        if (window.progressInterval) {
          clearInterval(window.progressInterval);
          window.progressInterval = null;
        }
        
        if (response.analyzedCars.length > 0) {
          displayResults(response.analyzedCars);
        }
      }
    };

    // Background'dan gelen mesajları dinle
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      //console.log('Mesaj alındı:', message);
      
      if (message.action === 'updateProgress') {
        progressCount.textContent = message.data.totalProcessed;
        currentPage.textContent = message.data.currentPage;
        totalPages.textContent = message.data.totalPages;
        
        // Son analiz edilen aracı göster
        if (message.data.lastAnalyzedCar) {
          const lastCarInfo = document.createElement('div');
          lastCarInfo.className = 'last-analyzed-car';
          lastCarInfo.style.cssText = 'margin-top: 10px; padding: 8px; background: #e3f2fd; border-radius: 4px; font-size: 0.9em;';
          lastCarInfo.innerHTML = `
            <p style="margin: 0;">🔍 Son İncelenen: ${message.data.lastAnalyzedCar.title}</p>
            <p style="margin: 5px 0 0;">💯 Puan: ${message.data.lastAnalyzedCar.scores.overall.toFixed(1)}</p>
          `;
          
          const existingInfo = progress.querySelector('.last-analyzed-car');
          if (existingInfo) {
            progress.replaceChild(lastCarInfo, existingInfo);
          } else {
            progress.appendChild(lastCarInfo);
          }
        }

        // Eğer analyzedCars varsa ve sayısı 0'dan büyükse, ara sonuçları göster
        if (message.data.analyzedCars && message.data.analyzedCars.length > 0) {
          //console.log('Ara sonuçlar güncelleniyor:', message.data.analyzedCars);
          displayResults(message.data.analyzedCars);
        }
      }
      
      if (message.action === 'analysisComplete') {
        progress.style.display = 'none';
        startButton.textContent = 'Analizi Başlat';
        startButton.classList.remove('running');
        downloadSection.style.display = 'block';
        
        // Analiz verilerini sakla
        window.analysisData = message.data;
        
        // Bildirim sesi çal
        const audio = new Audio(chrome.runtime.getURL('notification.wav'));
        audio.play().catch(error => console.log('Ses çalma hatası:', error));
        
        console.log('Analiz tamamlandı, sonuçlar:', message.data);
      }
      
      if (message.action === 'error') {
        progress.style.display = 'none';
        startButton.textContent = 'Analizi Başlat';
        startButton.classList.remove('running');
        results.innerHTML = `
          <div style="color: red; padding: 10px; background: #ffebee; border-radius: 4px;">
            <p><strong>Hata Oluştu:</strong></p>
            <p>${message.data.error}</p>
          </div>
        `;
        
        // Interval'i temizle
        if (window.progressInterval) {
          clearInterval(window.progressInterval);
          window.progressInterval = null;
        }
      }
    });

    // Başlangıçta ilerleme durumunu kontrol et
    await checkProgress();

    // Analiz başlatma/durdurma butonu
    startButton.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (startButton.classList.contains('running')) {
        // Analizi durdur
        await chrome.runtime.sendMessage({ action: 'stopAnalysis' });
        startButton.textContent = 'Analizi Başlat';
        startButton.classList.remove('running');
        progress.style.display = 'none';
        
        // Interval'i temizle
        if (window.progressInterval) {
          clearInterval(window.progressInterval);
          window.progressInterval = null;
        }
      } else {
        // Analizi başlat
        const response = await chrome.runtime.sendMessage({ 
          action: 'startAnalysis',
          tabId: tab.id,
          pageLimit: parseInt(pageLimitInput.value) || 0
        });
        
        if (response.status === 'started') {
          progress.style.display = 'block';
          results.innerHTML = '';
          startButton.textContent = 'Analizi Durdur';
          startButton.classList.add('running');
          
          // Otomatik güncelleme için interval başlat
          if (!window.progressInterval) {
            window.progressInterval = setInterval(checkProgress, 2000);
          }
        } else if (response.status === 'already_running') {
          alert('Analiz zaten çalışıyor!');
        }
      }
    });

  } catch (error) {
    console.error('Başlatma hatası:', error);
    document.getElementById('results').innerHTML = `
      <div style="color: red; padding: 10px; background: #ffebee; border-radius: 4px;">
        <p><strong>Hata:</strong> ${error.message}</p>
        <p>Lütfen şu adımları takip edin:</p>
        <ol>
          <li>Chrome'da <code>chrome://extensions</code> adresine gidin</li>
          <li>"Geliştirici modu"nu açın</li>
          <li>Eklentiyi kaldırın ve yeniden yükleyin</li>
          <li>Chrome'u yeniden başlatın</li>
        </ol>
      </div>
    `;
  }
});

// Yardımcı fonksiyonlar
async function sleep(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Bekleme süresi: ${delay}ms (${delay/1000} saniye)`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function processDetailPage(url, title) {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 İlan detayı açılıyor: ${title}`);
  const detailTab = await chrome.tabs.create({ url: url, active: false });
  console.log(`[${new Date().toLocaleTimeString()}] 📄 Yeni sekme açıldı (ID: ${detailTab.id})`);
  
  try {
    // Ana sekmeye geçiş yap
    const [mainTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // İnsansı davranışlar için yardımcı fonksiyon
    const simulateHumanBehavior = async (tabId) => {
      // Scroll simülasyonu
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const scrollSteps = [
            { position: 300, delay: 800 },
            { position: 600, delay: 1200 },
            { position: 900, delay: 1000 },
            { position: 1200, delay: 900 },
            { position: window.innerHeight, delay: 1100 }
          ];
          
          let currentStep = 0;
          const scrollInterval = setInterval(() => {
            if (currentStep >= scrollSteps.length) {
              clearInterval(scrollInterval);
              return;
            }
            
            window.scrollTo({
              top: scrollSteps[currentStep].position,
              behavior: 'smooth'
            });
            
            currentStep++;
          }, 1000);
        }
      });
      
      // Rastgele bekleme süresi (2-4 saniye)
      await sleep(2000, 4000);
    };
    
    // Detay sayfası yüklenme beklemesi
    console.log(`[${new Date().toLocaleTimeString()}] ⏳ Sayfa yükleniyor...`);
    await sleep(3000, 4000);
    
    // Detay sekmesine geç
    await chrome.tabs.update(detailTab.id, { active: true });
    console.log(`[${new Date().toLocaleTimeString()}] 👀 Detay sayfasına geçildi`);
    
    // İnsansı davranışlar simüle et
    await simulateHumanBehavior(detailTab.id);
    
    console.log(`[${new Date().toLocaleTimeString()}] 📊 İlan detayları analiz ediliyor...`);
    const details = await chrome.scripting.executeScript({
      target: { tabId: detailTab.id },
      func: () => {
        console.log('🔍 Detay sayfası analizi başladı');

        // Temel bilgileri alma fonksiyonu
        const getInfo = (label) => {
          const element = document.querySelector(`.classifiedInfoList li:contains("${label}") span`);
          if (element) {
            const text = element.textContent.trim();
            console.log(`${label}:`, text);
            return text;
          }
          return null;
        };

        // Fiyat bilgisini alma
        const getPrice = () => {
          const priceElement = document.querySelector('.classifiedPrice .price-value, .classified-price-wrapper');
          return priceElement ? parseFloat(priceElement.textContent.trim().replace(/[^0-9]/g, '')) : 0;
        };

        // Hasar ve boya durumunu alma
        const getDamageInfo = () => {
          const damageInfo = {
            paintedParts: [],
            changedParts: [],
            originalParts: [],
            accidentRecords: []
          };

          // Boyalı parçaları al
          document.querySelectorAll('.car-damage-info-list ul li.selected-damage').forEach(item => {
            damageInfo.paintedParts.push(item.textContent.trim());
          });

          // Kaza kayıtlarını al
          const description = document.querySelector('#classifiedDescription');
          if (description) {
            const text = description.textContent;
            const accidentMatches = text.match(/(\d{2}\.\d{2}\.\d{4})\s+Carpma.*?(?=\d{2}\.\d{2}\.\d{4}|$)/g);
            if (accidentMatches) {
              damageInfo.accidentRecords = accidentMatches.map(record => record.trim());
            }
          }

          return damageInfo;
        };

        // Donanım özelliklerini alma
        const getEquipment = () => {
          const equipment = {
            safety: [],
            comfort: [],
            multimedia: []
          };

          document.querySelectorAll('.classifiedInfoList .selected').forEach(item => {
            const text = item.textContent.trim();
            if (text.includes('ABS') || text.includes('ESP') || text.includes('Hava Yastığı')) {
              equipment.safety.push(text);
            } else if (text.includes('Klima') || text.includes('Koltuk')) {
              equipment.comfort.push(text);
            } else if (text.includes('USB') || text.includes('Bluetooth')) {
              equipment.multimedia.push(text);
            }
          });

          return equipment;
        };

        // Teknik özellikleri alma
        const getTechnicalInfo = () => {
          return {
            fuelConsumptionCity: getInfo('Şehir içi'),
            fuelConsumptionHighway: getInfo('Şehir dışı'),
            acceleration: getInfo('Hızlanma'),
            maxSpeed: getInfo('Azami Sürat'),
            enginePower: getInfo('Motor Gücü'),
            engineVolume: getInfo('Motor Hacmi'),
            transmission: getInfo('Vites'),
            traction: getInfo('Çekiş')
          };
        };

        // Tüm detayları topla
        const details = {
          price: getPrice(),
          year: getInfo('Yıl'),
          km: parseFloat(getInfo('KM')?.replace(/[^0-9]/g, '') || '0'),
          fuelType: getInfo('Yakıt Tipi'),
          transmission: getInfo('Vites'),
          damage: getDamageInfo(),
          equipment: getEquipment(),
          technical: getTechnicalInfo(),
          location: document.querySelector('h2')?.textContent.trim(),
          seller: {
            name: document.querySelector('.store-name-wrapper h5')?.textContent.trim(),
            licenseNo: document.querySelector('.certification .value')?.textContent.trim()
          }
        };

        // Puanlama sistemi
        const calculateScores = (details) => {
          let scores = {
            condition: 100, // Durum puanı
            technical: 100, // Teknik puan
            equipment: 100, // Donanım puanı
            value: 100 // Fiyat/değer puanı
          };

          // Durum puanı hesaplama
          const damageCount = details.damage.paintedParts.length + details.damage.changedParts.length;
          scores.condition -= damageCount * 5; // Her hasar 5 puan düşürür
          scores.condition -= details.damage.accidentRecords.length * 10; // Her kaza kaydı 10 puan düşürür

          // Teknik puan hesaplama
          if (details.technical.enginePower) {
            const powerValue = parseFloat(details.technical.enginePower);
            scores.technical += (powerValue > 100 ? 10 : 0);
          }

          // Donanım puanı hesaplama
          scores.equipment += details.equipment.safety.length * 5;
          scores.equipment += details.equipment.comfort.length * 3;
          scores.equipment += details.equipment.multimedia.length * 2;

          // Fiyat/değer puanı hesaplama
          const kmPenalty = Math.floor(details.km / 50000) * 5;
          scores.value -= kmPenalty;

          // Puanları 0-100 arasında normalize et
          Object.keys(scores).forEach(key => {
            scores[key] = Math.max(0, Math.min(100, scores[key]));
          });

          // Genel puan hesaplama
          scores.overall = (
            scores.condition * 0.3 +
            scores.technical * 0.2 +
            scores.equipment * 0.2 +
            scores.value * 0.3
          );

          return scores;
        };

        details.scores = calculateScores(details);
        
        console.log('✅ Detay analizi tamamlandı:', details);
        return details;
      }
    });

    // Ana sekmeye geri dön
    await chrome.tabs.update(mainTab.id, { active: true });
    console.log(`[${new Date().toLocaleTimeString()}] ↩️ Ana sekmeye dönüldü`);
    
    // Rastgele bekleme (3-8 saniye)
    const closeWaitTime = Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000;
    console.log(`[${new Date().toLocaleTimeString()}] ⏳ Sekme kapatılmadan önce ${(closeWaitTime/1000).toFixed(1)} saniye bekleniyor`);
    await sleep(closeWaitTime, closeWaitTime);
    
    // Detay sekmesini kapat
    console.log(`[${new Date().toLocaleTimeString()}] 🚫 Sekme kapatılıyor (ID: ${detailTab.id})`);
    await chrome.tabs.remove(detailTab.id);
    
    return details[0].result;
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Detay sayfası hatası (${title}):`, error);
    await chrome.tabs.remove(detailTab.id);
    return null;
  }
}

async function getPageContent(tab, pageNum) {
  console.log(`Sayfa ${pageNum} analiz ediliyor...`);
  
  // Sayfa değişimi öncesi rastgele bekleme (5-20 saniye)
  if (pageNum > 1) {
    const pageChangeWaitTime = Math.floor(Math.random() * (20000 - 5000 + 1)) + 5000;
    console.log(`Sayfa değişimi öncesi bekleniyor: ${pageChangeWaitTime/1000} saniye`);
    await sleep(pageChangeWaitTime, pageChangeWaitTime);
  }

  const content = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      console.log('Sayfa içeriği analizi başladı');
      
      // Ana tablo kontrolü
      const table = document.querySelector('table#searchResultsTable');
      console.log('Ana tablo bulundu:', !!table);

      // Toplam sayfa sayısını al
      const pageInfo = document.querySelector('.pageNavigator .mbdef')?.textContent || '';
      const totalPagesMatch = pageInfo.match(/Toplam (\d+) sayfa/);
      const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;
      
      // İlanları bul
      const listings = Array.from(document.querySelectorAll('tr.searchResultsItem'));
      console.log('Bulunan ilan sayısı:', listings.length);
      
      const cars = listings.map(tr => {
        try {
          const dataId = tr.getAttribute('data-id');
          console.log('İşlenen ilan ID:', dataId);

          const cells = tr.querySelectorAll('td');
          const brand = cells[1]?.textContent.trim();
          const series = cells[2]?.textContent.trim();
          const model = cells[3]?.textContent.trim();
          
          const titleLink = tr.querySelector('a.classifiedTitle');
          const title = titleLink?.textContent.trim();
          const url = titleLink?.href;

          const year = cells[5]?.textContent.trim();
          const km = cells[6]?.textContent.trim();
          const price = tr.querySelector('.classified-price-container span')?.textContent.trim();
          const location = tr.querySelector('.searchResultsLocationValue')?.textContent.trim();

          if (!url) {
            console.log('Link bulunamadı, bu ilan atlanıyor');
            return null;
          }

          return {
            id: dataId,
            url,
            title,
            brand,
            series,
            model,
            year,
            km,
            price,
            location
          };
        } catch (error) {
          console.log('İlan işleme hatası:', error);
          return null;
        }
      }).filter(Boolean);

      return {
        cars,
        totalPages,
        currentPage: parseInt(document.querySelector('#currentPageValue')?.value || '1')
      };
    }
  });

  if (!content[0]?.result?.cars?.length) {
    console.log('Sayfa sonucu:', content[0]?.result);
    throw new Error('Bu sayfada araç ilanı bulunamadı. Lütfen sayfayı yenileyin veya farklı bir arama yapın.');
  }

  // Sayfa analizi sonrası rastgele bekleme (3-15 saniye)
  const analysisWaitTime = Math.floor(Math.random() * (15000 - 3000 + 1)) + 3000;
  console.log(`Sayfa analizi sonrası bekleniyor: ${analysisWaitTime/1000} saniye`);
  await sleep(analysisWaitTime, analysisWaitTime);

  return content[0].result;
}

function calculateScores(car, details) {
  console.log('Puan hesaplanıyor:', car.title);
  
  const scores = {
    overall: 0,
    value: 0,
    condition: 100,
    technical: 0,
    equipment: 0,
    seller: 0
  };
  
  try {
    // Fiyat/Değer Puanı (30%)
    const price = parseFloat(car.price.replace(/[^0-9]/g, '')) || 0;
    const year = parseInt(car.year) || new Date().getFullYear();
    const km = parseInt(car.km?.replace(/[^0-9]/g, '')) || 0;
    
    // Fiyat puanı - ortalama fiyata göre
    const avgPricePerYear = 150000; // Ortalama yıllık değer
    const expectedPrice = avgPricePerYear * (new Date().getFullYear() - year + 1);
    scores.value = Math.max(0, 100 - (Math.abs(price - expectedPrice) / expectedPrice * 100));
    
    // Kilometre puanı
    const expectedKm = (new Date().getFullYear() - year + 1) * 20000; // Yıllık ortalama 20,000 km
    scores.value = Math.max(0, scores.value - (Math.max(0, km - expectedKm) / 10000));
    
    // Durum Puanı (25%)
    scores.condition = 100;
    if (car.damage) {
      const paintedCount = car.damage.paintedParts?.length || 0;
      const changedCount = car.damage.changedParts?.length || 0;
      const damagedCount = car.damage.damagedParts?.length || 0;
      
      scores.condition -= paintedCount * 5; // Her boyalı parça için -5 puan
      scores.condition -= changedCount * 10; // Her değişen parça için -10 puan
      scores.condition -= damagedCount * 15; // Her hasarlı parça için -15 puan
    }
    
    // Teknik Puan (20%)
    if (car.technical) {
      scores.technical = 85; // Başlangıç puanı
      
      // Motor gücü puanı
      const enginePower = parseInt(car.technical.engine?.power) || 0;
      if (enginePower > 100) scores.technical += 5;
      if (enginePower > 150) scores.technical += 5;
      
      // Yakıt tipi puanı
      if (car.technical.fuel?.type === 'Dizel') scores.technical += 5;
      if (car.technical.fuel?.type === 'Hibrit' || car.technical.fuel?.type === 'Elektrikli') scores.technical += 10;
      
      // Şanzıman puanı
      if (car.technical.transmission?.type === 'Otomatik') scores.technical += 5;
    }
    
    // Donanım Puanı (15%)
    if (car.equipment) {
      const totalEquipment = [
        ...(car.equipment.safety || []),
        ...(car.equipment.exterior || []),
        ...(car.equipment.interior || []),
        ...(car.equipment.multimedia || []),
        ...(car.equipment.other || [])
      ].length;
      
      scores.equipment = Math.min(100, totalEquipment * 5); // Her donanım için 5 puan, max 100
    }
    
    // Satıcı Puanı (10%)
    scores.seller = 80; // Temel satıcı puanı
    if (car.seller) {
      if (car.seller.isDealer) scores.seller += 10;
      if (car.seller.rating > 4) scores.seller += 10;
    }
    
    // Genel puan hesaplama (ağırlıklı ortalama)
    scores.overall = Math.round(
      scores.value * 0.30 +
      scores.condition * 0.25 +
      scores.technical * 0.20 +
      scores.equipment * 0.15 +
      scores.seller * 0.10
    );
    
    // Puanları 0-100 arasına normalize et
    Object.keys(scores).forEach(key => {
      scores[key] = Math.max(0, Math.min(100, Math.round(scores[key])));
    });
    
    console.log('Hesaplanan puanlar:', scores);
    return scores;
  } catch (error) {
    console.error('Puan hesaplama hatası:', error);
    return scores; // Hata durumunda başlangıç puanlarını döndür
  }
}

// Sonuçları görüntüleme
function displayResults(cars) {
  const results = document.getElementById('results');
  
  if (!cars || cars.length === 0) {
    results.innerHTML = '<p>Henüz analiz edilmiş araç yok.</p>';
    return;
  }

  // Araçları genel puana göre sırala
  const sortedCars = [...cars].sort((a, b) => b.scores.overall - a.scores.overall);

  // Sonuçları göster
  results.innerHTML = `
    <h3>Analiz Sonuçları (${cars.length} araç)</h3>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Sıra</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Marka/Seri</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Yıl</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">KM</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Fiyat</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Değişen</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Boyalı</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Lokal Boyalı</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Puan</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">İşlem</th>
          </tr>
        </thead>
        <tbody>
          ${sortedCars.map((car, index) => {
            const getScoreColor = (score) => {
              if (score >= 85) return '#4CAF50';
              if (score >= 70) return '#FFA726';
              return '#f44336';
            };

            const rowBackground = index === 0 ? '#f1f8e9' :
                                index === 1 ? '#f9fbe7' :
                                index === 2 ? '#fff8e1' :
                                'white';

            return `
              <tr style="background: ${rowBackground}; border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${index + 1}</td>
                <td style="padding: 10px;">${car.brand}/${car.series}</td>
                <td style="padding: 10px;">${car.year || 'Belirtilmemiş'}</td>
                <td style="padding: 10px;">${car.km || 'Belirtilmemiş'}</td>
                <td style="padding: 10px;">${car.price}</td>
                <td style="padding: 10px; text-align: center;">${car.damage?.changedParts?.length || 0}</td>
                <td style="padding: 10px; text-align: center;">${car.damage?.paintedParts?.length || 0}</td>
                <td style="padding: 10px; text-align: center;">${car.damage?.localPaintedParts?.length || 0}</td>
                <td style="padding: 10px; text-align: center; font-weight: bold;">
                  <span style="color: ${getScoreColor(car.scores.overall)}">
                    ${car.scores.overall}/100
                  </span>
                </td>
                <td style="padding: 10px; text-align: center;">
                  <a href="${car.url}" target="_blank" class="search-link" title="İlana Git">
                    🔍
                  </a>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
} 