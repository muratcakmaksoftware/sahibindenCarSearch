// Yardımcı fonksiyonlar
async function sleep(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Bekleme süresi: ${delay}ms (${delay/1000} saniye)`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

// API'lerin hazır olduğundan emin ol
chrome.runtime.onInstalled.addListener(() => {
  console.log('Eklenti yüklendi ve API\'ler hazırlanıyor...');
});

// Gerekli API'leri kontrol et
const requiredApis = ['scripting', 'tabs'];
const missingApis = requiredApis.filter(api => !chrome[api]);

if (missingApis.length > 0) {
  console.error('Eksik API\'ler:', missingApis);
} else {
  console.log('Tüm API\'ler başarıyla yüklendi');
}

// İzinleri kontrol et ve gerekirse iste
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.checkPermissions) {
    chrome.permissions.getAll(permissions => {
      console.log('Mevcut izinler:', permissions);
      sendResponse({ permissions });
    });
    return true;
  }
});

let isAnalysisRunning = false;
let analyzedCars = [];
let totalProcessed = 0;
let currentPage = 1;
let totalPages = 1;
let userPageLimit = 0; // Kullanıcının girdiği sayfa limiti

// Popup'tan mesaj dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startAnalysis') {
    if (!isAnalysisRunning) {
      isAnalysisRunning = true;
      userPageLimit = message.pageLimit || 0; // Sayfa limitini kaydet
      startAnalysis(message.tabId);
      sendResponse({ status: 'started' });
    } else {
      sendResponse({ status: 'already_running' });
    }
    return true;
  }
  
  if (message.action === 'getProgress') {
    sendResponse({
      isRunning: isAnalysisRunning,
      totalProcessed,
      currentPage,
      totalPages,
      analyzedCars,
      userPageLimit // Sayfa limitini de gönder
    });
    return true;
  }
  
  if (message.action === 'stopAnalysis') {
    isAnalysisRunning = false;
    sendResponse({ status: 'stopped' });
    return true;
  }
});

// Ana sayfada scroll simülasyonu
async function simulateScrolling(tabId, targetItemId = null) {
  console.log(`[${new Date().toLocaleTimeString()}] 📜 Scroll simülasyonu başlatılıyor...`);
  
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (targetId) => {
      return new Promise((resolve) => {
        let targetPosition = 0;
        let targetItem = null;
        
        // Hedef ilanın pozisyonunu bul
        if (targetId) {
          targetItem = document.querySelector(`tr[data-id="${targetId}"]`);
          if (targetItem) {
            targetPosition = targetItem.getBoundingClientRect().top + window.scrollY - (window.innerHeight / 3);
          }
        }
        
        let scrollCount = 0;
        
        const scroll = () => {
          if (targetId && targetItem) {
            // Hedef pozisyonun ±100px civarında rastgele scroll
            const minScroll = Math.max(0, targetPosition - 100);
            const maxScroll = Math.min(document.documentElement.scrollHeight - window.innerHeight, targetPosition + 100);
            
            // Rastgele bir pozisyon seç
            const newPosition = Math.floor(Math.random() * (maxScroll - minScroll)) + minScroll;
            
            window.scrollTo({
              top: newPosition,
              behavior: 'smooth'
            });
            
            // İlgili ilanı vurgula
            targetItem.style.backgroundColor = '#f8f9fa';
            setTimeout(() => {
              targetItem.style.backgroundColor = '';
            }, 300);
          }
          
          scrollCount++;
          
          // 1-2 scroll sonra dur
          if (scrollCount >= Math.floor(Math.random() * 2) + 1) {
            clearInterval(scrollInterval);
            
            // Hedef ilana tam ortalayarak bitir
            if (targetItem) {
              window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
              });
            }
            
            setTimeout(resolve, 300);
          }
        };
        
        // Her 0.4-0.6 saniyede bir scroll
        const scrollInterval = setInterval(scroll, Math.random() * 200 + 400);
      });
    },
    args: [targetItemId]
  });
}

// Detay sayfasında scroll simülasyonu
async function simulateDetailPageScrolling(tabId) {
  console.log(`[${new Date().toLocaleTimeString()}] 📜 Detay sayfasında scroll simülasyonu başlatılıyor...`);
  
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return new Promise((resolve) => {
        let scrollCount = 0;
        const maxScrolls = Math.floor(Math.random() * 2) + 2; // 2-3 scroll
        
        const scroll = () => {
          const scrollAmount = Math.floor(Math.random() * 200) + 150;
          window.scrollBy({
            top: scrollAmount,
            behavior: 'smooth'
          });
          
          scrollCount++;
          if (scrollCount >= maxScrolls) {
            clearInterval(scrollInterval);
            
            // En üste yumuşak scroll
            window.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
            
            setTimeout(resolve, 300);
          }
        };
        
        // Her 0.4-0.6 saniyede bir scroll
        const scrollInterval = setInterval(scroll, Math.random() * 200 + 400);
      });
    }
  });
}

async function processDetailPage(url, title, tabId, carId) {
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 İlana tıklanıyor: ${title}`);
  
  try {
    // İlana tıkla - reklam elementlerini atla
    const clickResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: (id) => {
        // Reklam olmayan gerçek ilan linkini bul
        const item = document.querySelector(`tr[data-id="${id}"].searchResultsItem:not(.nativeAd):not(.classicNativeAd) a.classifiedTitle`);
        
        // Eğer element reklam değilse ve bulunduysa tıkla
        if (item) {
          item.click();
          return true;
        }
        
        console.log('Tıklanamadı Element:', item);
        return false;
      },
      args: [carId]
    });

    if (!clickResult || !clickResult[0] || !clickResult[0].result) {
      console.error('İlana tıklanamadı Element:', clickResult);
      return null;
    }
    
    // Sayfa yüklenme beklemesi
    await sleep(2000, 2800);
    
    // Detay sayfasında scroll
    await simulateDetailPageScrolling(tabId);
    
    // Detayları topla
    const details = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        console.log('🔍 Detay sayfası analizi başladı');

        // Temel bilgileri alma fonksiyonu
        const getInfo = (label) => {
          try {
            // classifiedInfoList içindeki tüm li elementlerini bul
            const listItems = document.querySelectorAll('.classifiedInfoList li');
            
            // Her bir li elementi içinde strong etiketi içinde label'ı ara
            for (const li of listItems) {
              const strongText = li.querySelector('strong')?.textContent.trim() || '';
              if (strongText.includes(label)) {
                // Span içindeki değeri al ve temizle
                const value = li.querySelector('span')?.textContent.trim().replace(/\s+/g, ' ') || null;
                console.log(`${label} bulundu:`, value);
                return value;
              }
            }
            
            console.log(`${label} bulunamadı`);
            return null;
          } catch (error) {
            console.error(`${label} bilgisi alınamadı:`, error);
            return null;
          }
        };

        // Hasar ve boya durumunu alma
        const getDamageInfo = () => {
          try {
            const damageInfo = {
              paintedParts: [],
              changedParts: [],
              localPaintedParts: [],
              tramerAmount: null,
              maxTramerAmount: null,
              descriptionTramer: null,
              hasTramerInfo: false // Tramer bilgisi bulundu mu?
            };

            // Hasar listesini bul
            const damageList = document.querySelector('.car-damage-info-list');
            if (damageList) {
              // Lokal Boyalı Parçalar
              const localPaintedSection = damageList.querySelector('ul:has(.local-painted-new)');
              if (localPaintedSection) {
                localPaintedSection.querySelectorAll('li.selected-damage').forEach(item => {
                  damageInfo.localPaintedParts.push(item.textContent.trim());
                });
              }

              // Boyalı Parçalar
              const paintedSection = damageList.querySelector('ul:has(.painted-new)');
              if (paintedSection) {
                paintedSection.querySelectorAll('li.selected-damage').forEach(item => {
                  damageInfo.paintedParts.push(item.textContent.trim());
                });
              }

              // Değişen Parçalar
              const changedSection = damageList.querySelector('ul:has(.changed-new)');
              if (changedSection) {
                changedSection.querySelectorAll('li.selected-damage').forEach(item => {
                  damageInfo.changedParts.push(item.textContent.trim());
                });
              }
            }

            // Tramer bilgisini al
            const tramerInfo = getInfo('Tramer Tutarı');
            if (tramerInfo && tramerInfo !== 'Belirtilmemiş') {
              const amount = parseFloat(tramerInfo.replace(/[^0-9]/g, '')) || 0;
              damageInfo.tramerAmount = amount;
              damageInfo.maxTramerAmount = amount;
              damageInfo.hasTramerInfo = true;
            }

            // Açıklamadan tramer bilgisi çıkar
            const description = document.querySelector('#classifiedDescription');
            if (description) {
              const text = description.textContent.toLowerCase();
              const tramerMatches = text.match(/tramer.{0,50}?(\d{1,3}(?:[.,]\d{3})*)/g);
              
              if (tramerMatches) {
                tramerMatches.forEach(match => {
                  const amount = parseFloat(match.replace(/[^0-9]/g, '')) || 0;
                  if (amount > 0) {
                    damageInfo.descriptionTramer = amount;
                    damageInfo.maxTramerAmount = Math.max(
                      damageInfo.maxTramerAmount || 0,
                      amount
                    );
                    damageInfo.hasTramerInfo = true;
                  }
                });
              }
            }

            // Ağır hasar kaydını al
            const heavyDamageInfo = getInfo('Ağır Hasar Kayıtlı');
            if (heavyDamageInfo) {
              damageInfo.heavyDamage = heavyDamageInfo;
            }

            console.log('Hasar bilgileri:', damageInfo);
            return damageInfo;
          } catch (error) {
            console.error('Hasar bilgileri alınamadı:', error);
            return {
              paintedParts: [],
              changedParts: [],
              localPaintedParts: [],
              tramerAmount: null,
              maxTramerAmount: null,
              descriptionTramer: null,
              hasTramerInfo: false,
              heavyDamage: null
            };
          }
        };

        // Donanım özelliklerini alma
        const getEquipment = () => {
          try {
            const equipment = {
              safety: [],
              exterior: [],
              interior: [],
              multimedia: []
            };

            // Ana donanım container'ını bul
            const container = document.querySelector('#classifiedProperties');
            if (!container) {
              console.log('Donanım container bulunamadı');
              return equipment;
            }

            // Her bir kategoriyi işle
            const categories = container.querySelectorAll('h3');
            categories.forEach(category => {
              const categoryName = category.textContent.trim();
              const itemList = category.nextElementSibling;
              
              if (!itemList || !itemList.tagName || itemList.tagName.toLowerCase() !== 'ul') {
                return;
              }

              // Sadece seçili (aktif) donanımları al
              const selectedItems = itemList.querySelectorAll('li.selected');
              
              selectedItems.forEach(item => {
                const text = item.childNodes[0].textContent.trim();
                
                switch(categoryName) {
                  case 'Güvenlik':
                    equipment.safety.push(text);
                    break;
                  case 'Dış Donanım':
                    equipment.exterior.push(text);
                    break;
                  case 'İç Donanım':
                    equipment.interior.push(text);
                    break;
                  case 'Multimedya':
                    equipment.multimedia.push(text);
                    break;
                }
              });
            });

            console.log('Toplanan donanım bilgileri:', equipment);
            return equipment;
          } catch (error) {
            console.error('Donanım bilgileri alınamadı:', error);
            return { safety: [], exterior: [], interior: [], multimedia: [] };
          }
        };

        // Teknik özellikleri alma
        const getTechnicalInfo = () => {
          const technical = {
            engine: {
              volume: getInfo('Motor Hacmi'),
              power: getInfo('Motor Gücü'),
              type: getInfo('Motor Tipi')
            },
            transmission: {
              type: getInfo('Vites'),
              drive: getInfo('Çekiş')
            },
            fuel: {
              type: getInfo('Yakıt'),
              consumption: {
                city: getInfo('Ortalama Yakıt Tüketimi'),
                highway: getInfo('Yakıt Tüketimi (Şehir Dışı)'),
                combined: getInfo('Yakıt Tüketimi (Karma)')
              },
              tank: getInfo('Yakıt Deposu')
            },
            performance: {
              acceleration: getInfo('0-100 Hızlanma'),
              topSpeed: getInfo('Maksimum Hız')
            }
          };

          console.log('Teknik bilgiler:', technical);
          return technical;
        };

        // Satıcı bilgilerini alma
        const getSellerInfo = () => {
          try {
            const seller = {
              name: document.querySelector('.store-title')?.textContent.trim(),
              type: document.querySelector('.store-subtitle')?.textContent.trim(),
              location: document.querySelector('.store-address')?.textContent.trim(),
              phone: document.querySelector('.store-phone')?.textContent.trim(),
              rating: document.querySelector('.store-rating')?.textContent.trim(),
              memberSince: document.querySelector('.store-date')?.textContent.trim()
            };

            console.log('Satıcı bilgileri:', seller);
            return seller;
          } catch (error) {
            console.error('Satıcı bilgileri alınamadı:', error);
            return { name: null, type: null, location: null, phone: null, rating: null, memberSince: null };
          }
        };

        // Tüm detayları topla
        const details = {
          price: document.querySelector('.classifiedPrice .price-value')?.textContent.trim(),
          year: getInfo('Yıl'),
          km: getInfo('KM'),
          color: getInfo('Renk'),
          warranty: getInfo('Garanti'),
          exchange: getInfo('Takas'),
          damage: getDamageInfo(),
          equipment: getEquipment(),
          technical: getTechnicalInfo(),
          seller: getSellerInfo(),
          lastUpdated: document.querySelector('.classifiedInfo .date')?.textContent.trim()
        };

        // Yıl ve KM değerlerini sayısal formata çevir
        if (details.year) {
          details.year = details.year.replace(/[^0-9]/g, '');
        }
        
        if (details.km) {
          details.km = details.km.replace(/[^0-9]/g, '');
        }

        console.log('Detay analizi tamamlandı:', details);
        return details;
      }
    });
    
    // Geri dön
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.history.back();
      }
    });
    
    // Sayfa yüklenme beklemesi
    await sleep(2000, 2200);
    
    if (!details || !details[0] || !details[0].result) {
      console.error('Detay bilgileri alınamadı!');
      return null;
    }

    console.log('İşlenen detay bilgileri:', details[0].result);
    return details[0].result;
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Detay sayfası hatası (${title}):`, error);
    
    // Hata durumunda ana sayfaya dön
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.history.back();
      }
    });
    
    await sleep(2000, 2200);
    return null;
  }
}

// Filtre bilgilerini HTML'den çıkar
function parseFiltersFromHTML() {
  const filters = {
    location: [],
    price: '',
    year: '',
    gear: '',
    km: '',
    fuelType: '',
    bodyType: [],
    color: [],
    enginePower: [],
    engineSize: [],
    transmission: [],
    heavyDamage: '',
    fromWho: '',
    exchangeable: '',
    listingDate: '',
    licensePlate: [],
    hasVideo: false,
    hasClip: false,
    noPaint: false,
    noChange: false
  };

  try {
    const filterList = document.querySelector('#currentFilters');
    if (!filterList) {
      console.log('Filtre listesi bulunamadı');
      return filters;
    }

    console.log('Filtreler ayrıştırılıyor...');
    filterList.querySelectorAll('li').forEach(li => {
      const titleElement = li.querySelector('strong span');
      if (!titleElement) return;

      const title = titleElement.textContent.trim();
      const values = Array.from(li.querySelectorAll('a')).map(a => a.getAttribute('title')?.trim()).filter(Boolean);
      
      console.log(`Filtre: ${title}`, values);

      switch (title) {
        case 'Adres':
          filters.location = values;
          break;
        case 'Fiyat (TL)':
          filters.price = values[0] || '';
          break;
        case 'Yıl':
          filters.year = values[0] || '';
          break;
        case 'Vites':
          filters.gear = values[0] || '';
          break;
        case 'KM':
          filters.km = values[0] || '';
          break;
        case 'Yakıt Tipi':
          filters.fuelType = values.join(', ');
          break;
        case 'Kasa Tipi':
          filters.bodyType = values;
          break;
        case 'Renk':
          filters.color = values;
          break;
        case 'Motor Gücü':
          filters.enginePower = values;
          break;
        case 'Motor Hacmi':
          filters.engineSize = values;
          break;
        case 'Çekiş':
          filters.transmission = values;
          break;
        case 'Ağır Hasar Kayıtlı':
          filters.heavyDamage = values[0] || '';
          break;
        case 'Kimden':
          filters.fromWho = values[0] || '';
          break;
        case 'Takaslı':
          filters.exchangeable = values[0] || '';
          break;
        case 'İlan Tarihi':
          filters.listingDate = values[0] || '';
          break;
        case 'Fotoğraf, Video':
          filters.hasVideo = values.includes('Videolu ilanlar');
          filters.hasClip = values.includes('Klipli ilanlar');
          break;
        case 'Boya, Değişen Parça':
          filters.noPaint = values.includes('Boyasız');
          filters.noChange = values.includes('Değişensiz');
          break;
        case 'Plaka / Uyruk':
          filters.licensePlate = values;
          break;
      }
    });

    console.log('Toplanan filtre bilgileri:', filters);
    return filters;
  } catch (error) {
    console.error('HTML filtre çıkarma hatası:', error);
    return filters;
  }
}

// Filtre özetini oluştur
function createFilterSummary(filters) {
  const summary = [];
  
  if (filters.brand) summary.push(`Marka: ${filters.brand}`);
  if (filters.model) summary.push(`Model: ${filters.model}`);
  if (filters.minYear && filters.maxYear) summary.push(`Yıl: ${filters.minYear} - ${filters.maxYear}`);
  else if (filters.minYear) summary.push(`Yıl: ${filters.minYear} ve üstü`);
  else if (filters.maxYear) summary.push(`Yıl: ${filters.maxYear} ve altı`);
  
  if (filters.minKm && filters.maxKm) summary.push(`KM: ${filters.minKm} - ${filters.maxKm}`);
  else if (filters.minKm) summary.push(`KM: ${filters.minKm} ve üstü`);
  else if (filters.maxKm) summary.push(`KM: ${filters.maxKm} ve altı`);
  
  if (filters.minPrice && filters.maxPrice) summary.push(`Fiyat: ${filters.minPrice} - ${filters.maxPrice}`);
  else if (filters.minPrice) summary.push(`Fiyat: ${filters.minPrice} ve üstü`);
  else if (filters.maxPrice) summary.push(`Fiyat: ${filters.maxPrice} ve altı`);
  
  if (filters.gear) summary.push(`Vites: ${filters.gear}`);
  if (filters.fuel) summary.push(`Yakıt: ${filters.fuel}`);
  if (filters.location.length) summary.push(`Şehir: ${filters.location.join(' | ')}`);
  
  return summary;
}

// HTML raporu oluştur ve göster
async function showHTMLReport(analyzedCars, searchFilters) {
  // Araçları puana göre sırala
  const sortedCars = [...analyzedCars].sort((a, b) => b.scores.overall - a.scores.overall);
  
  // Filtre özeti oluştur
  let filterSummaryHTML = '';
  if (searchFilters) {
    const filterRows = [];
    if (searchFilters.location) filterRows.push(`<tr><td>Konum:</td><td>${searchFilters.location}</td></tr>`);
    if (searchFilters.price) filterRows.push(`<tr><td>Fiyat:</td><td>${searchFilters.price}</td></tr>`);
    if (searchFilters.year) filterRows.push(`<tr><td>Yıl:</td><td>${searchFilters.year}</td></tr>`);
    if (searchFilters.km) filterRows.push(`<tr><td>KM:</td><td>${searchFilters.km}</td></tr>`);
    if (searchFilters.gear) filterRows.push(`<tr><td>Vites:</td><td>${searchFilters.gear}</td></tr>`);
    if (searchFilters.fuelType) filterRows.push(`<tr><td>Yakıt:</td><td>${searchFilters.fuelType}</td></tr>`);
    if (searchFilters.bodyType.length) filterRows.push(`<tr><td>Kasa:</td><td>${searchFilters.bodyType.join(', ')}</td></tr>`);
    if (searchFilters.color.length) filterRows.push(`<tr><td>Renk:</td><td>${searchFilters.color.join(', ')}</td></tr>`);
    if (searchFilters.enginePower.length) filterRows.push(`<tr><td>Motor Gücü:</td><td>${searchFilters.enginePower.join(', ')}</td></tr>`);
    if (searchFilters.engineSize.length) filterRows.push(`<tr><td>Motor Hacmi:</td><td>${searchFilters.engineSize.join(', ')}</td></tr>`);
    if (searchFilters.transmission.length) filterRows.push(`<tr><td>Çekiş:</td><td>${searchFilters.transmission.join(', ')}</td></tr>`);
    if (searchFilters.licensePlate.length) filterRows.push(`<tr><td>Plaka / Uyruk:</td><td>${searchFilters.licensePlate.join(', ')}</td></tr>`);
    if (searchFilters.heavyDamage) filterRows.push(`<tr><td>Ağır Hasar:</td><td>${searchFilters.heavyDamage}</td></tr>`);
    if (searchFilters.fromWho) filterRows.push(`<tr><td>Kimden:</td><td>${searchFilters.fromWho}</td></tr>`);
    if (searchFilters.exchangeable) filterRows.push(`<tr><td>Takaslı:</td><td>${searchFilters.exchangeable}</td></tr>`);
    if (searchFilters.listingDate) filterRows.push(`<tr><td>İlan Tarihi:</td><td>${searchFilters.listingDate}</td></tr>`);
    
    filterSummaryHTML = `
      <div class="filter-summary">
        <h3>Filtre Bilgileri</h3>
        <table class="filter-table">
          ${filterRows.join('')}
        </table>
      </div>
    `;
        }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Araç Analiz Raporu</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
        }
        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 10px;
        }
        .filter-summary {
          background-color: white;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .filter-summary h2 {
          margin: 0 0 10px 0;
          font-size: 1.2em;
          color: #4CAF50;
        }
        .filter-summary ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .filter-summary li {
          background-color: #e8f5e9;
          padding: 5px 10px;
          border-radius: 15px;
          font-size: 0.9em;
          color: #2e7d32;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background-color: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
      }
        th {
          background-color: #4CAF50;
          color: white;
          position: sticky;
          top: 0;
    }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .score {
          font-weight: bold;
        }
        .score-high {
          color: #4CAF50;
        }
        .score-medium {
          color: #FFA500;
        }
        .score-low {
          color: #f44336;
  }
        .damage-info {
          font-size: 0.9em;
          color: #666;
        }
        .stats {
          margin: 15px 0;
          padding: 15px;
          background-color: white;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stats p {
          margin: 5px 0;
          color: #666;
        }
        .link-icon {
          color: #4CAF50;
          text-decoration: none;
          font-size: 1.2em;
          padding: 5px;
          border-radius: 4px;
          transition: background-color 0.2s;
}
        .link-icon:hover {
          background-color: #e8f5e9;
        }
        .equipment-list {
          font-size: 0.9em;
          color: #666;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .equipment-list li {
          display: inline-block;
          margin-right: 8px;
          background-color: #f0f0f0;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.8em;
        }
        .sort-select {
          margin: 10px 0;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: white;
          font-size: 14px;
          color: #333;
        }
        
        .rank {
          font-weight: bold;
          color: #1976d2;
          background-color: #e3f2fd;
          padding: 2px 8px;
          border-radius: 12px;
          display: inline-block;
          min-width: 20px;
          text-align: center;
        }
        
        .tooltip {
          position: relative;
          cursor: pointer;
        }
        
        .tooltip .tooltip-content {
          visibility: hidden;
          background-color: #fff;
          color: #333;
          text-align: left;
          border-radius: 6px;
          padding: 10px;
          position: absolute;
          z-index: 1;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%);
          min-width: 250px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          opacity: 0;
          transition: opacity 0.3s;
        }
        
        .tooltip:hover .tooltip-content {
          visibility: visible;
          opacity: 1;
        }
        
        .tooltip-content h4 {
          margin: 0 0 5px 0;
          color: #4CAF50;
          font-size: 0.9em;
        }
        
        .tooltip-content ul {
          margin: 0 0 8px 0;
          padding: 0;
          list-style: none;
          font-size: 0.85em;
        }
        
        .tooltip-content li {
          margin: 2px 0;
          padding: 2px 0;
          border-bottom: 1px solid #eee;
        }
        
        .tooltip-content li:last-child {
          border-bottom: none;
        }
        
        .equipment-count {
          font-size: 0.8em;
          color: #666;
          margin-left: 5px;
        }
        
        .modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0,0,0,0.5);
          overflow-y: auto;
        }
        
        .modal-content {
          background-color: #fff;
          margin: 15% auto;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          position: relative;
          width: 90%;
          max-width: 600px;
          animation: modalSlide 0.3s ease-out;
        }
        
        @keyframes modalSlide {
          from {
            transform: translateY(-100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .modal-close {
          position: absolute;
          right: 15px;
          top: 10px;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          line-height: 1;
        }
        
        .modal-close:hover {
          color: #333;
        }
        
        .modal-title {
          margin: 0 0 20px 0;
          color: #4CAF50;
          font-size: 1.2em;
          padding-right: 30px;
        }
        
        .equipment-section {
          margin-bottom: 20px;
        }
        
        .equipment-section h4 {
          color: #1976d2;
          margin: 0 0 10px 0;
          font-size: 1em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .equipment-section h4 span {
          background: #e3f2fd;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.85em;
        }
        
        .equipment-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        
        .equipment-list li {
          padding: 8px;
          border-bottom: 1px solid #eee;
          font-size: 0.9em;
        }
        
        .equipment-list li:last-child {
          border-bottom: none;
        }
        
        .equipment-trigger {
          cursor: pointer;
          text-decoration: underline;
          color: #1976d2;
        }
        
        .equipment-count {
          font-size: 0.8em;
          color: #666;
          margin-left: 5px;
        }
        
        @media (max-width: 768px) {
          .modal-content {
            margin: 10% auto;
            width: 95%;
            padding: 15px;
          }
          
          .equipment-section h4 {
            font-size: 0.9em;
          }
          
          .equipment-list li {
            font-size: 0.85em;
            padding: 6px;
          }
        }
        .filter-table {
          width: 100%;
          border-collapse: collapse;
        }
        .filter-table td {
          padding: 8px;
          border-bottom: 1px solid #ddd;
        }
        .filter-table td:first-child {
          font-weight: bold;
          width: 150px;
        }
      </style>
      <script>
        function showEquipmentModal(carId) {
          const modal = document.getElementById('equipmentModal');
          const content = document.getElementById('modalContent');
          const data = JSON.parse(document.getElementById('equipmentData_' + carId).value);
          
          let html = '<h3 class="modal-title">' + data.title + ' - Donanım Listesi</h3>';
          
          if (data.safety.length > 0) {
            html += createSection('Güvenlik', data.safety);
          }
          if (data.interior.length > 0) {
            html += createSection('İç Donanım', data.interior);
          }
          if (data.exterior.length > 0) {
            html += createSection('Dış Donanım', data.exterior);
          }
          if (data.multimedia.length > 0) {
            html += createSection('Multimedya', data.multimedia);
          }
          
          content.innerHTML = html;
          modal.style.display = 'block';
          
          // Scroll'u kapat
          document.body.style.overflow = 'hidden';
        }
        
        function createSection(title, items) {
          return \`
            <div class="equipment-section">
              <h4>\${title} <span>\${items.length}</span></h4>
              <ul class="equipment-list">
                \${items.map(item => '<li>' + item + '</li>').join('')}
              </ul>
      </div>
          \`;
  }

        function closeModal() {
          const modal = document.getElementById('equipmentModal');
          modal.style.display = 'none';
          // Scroll'u geri aç
          document.body.style.overflow = 'auto';
        }
        
        // Modal dışına tıklanınca kapat
        window.onclick = function(event) {
          const modal = document.getElementById('equipmentModal');
          if (event.target == modal) {
            closeModal();
          }
        }
      </script>
    </head>
    <body>
      ${filterSummaryHTML}
      <div class="container">
        <h1>Araç Analiz Raporu</h1>
        
        <div class="stats">
          <p>Toplam İncelenen İlan: ${analyzedCars.length}</p>
          <p>Ortalama Genel Puan: ${Math.round(analyzedCars.reduce((acc, car) => acc + car.scores.overall, 0) / analyzedCars.length)}</p>
        </div>

        <select class="sort-select" onchange="sortTable(this.value)">
          <option value="overall">Genel Puana Göre Sırala</option>
          <option value="value">Fiyat/Değer Puanına Göre Sırala</option>
          <option value="condition">Durum Puanına Göre Sırala</option>
          <option value="price">Fiyata Göre Sırala (Düşükten Yükseğe)</option>
          <option value="year">Yıla Göre Sırala (Yeniden Eskiye)</option>
          <option value="km">Kilometreye Göre Sırala (Düşükten Yükseğe)</option>
        </select>

        <table>
          <thead>
            <tr>
              <th>Sıra</th>
              <th>Marka/Model</th>
              <th>Yıl/KM</th>
              <th>Fiyat</th>
              <th>Genel Puan</th>
              <th>Fiyat/Değer</th>
              <th>Durum</th>
              <th>Teknik</th>
              <th>Donanım</th>
              <th>Hasar Bilgisi</th>
              <th>İlan</th>
            </tr>
          </thead>
          <tbody>
            ${sortedCars.map((car, index) => {
              const getScoreClass = score => {
                if (score >= 80) return 'score-high';
                if (score >= 60) return 'score-medium';
                return 'score-low';
              };
              
              const damageInfo = car.damage ? `
                ${car.damage.changedParts?.length ? `Değişen: ${car.damage.changedParts.length}` : ''}
                ${car.damage.paintedParts?.length ? `Boyalı: ${car.damage.paintedParts.length}` : ''}
                ${car.damage.localPaintedParts?.length ? `Lokal: ${car.damage.localPaintedParts.length}` : ''}
                ${car.damage.maxTramerAmount ? `Tramer: ${car.damage.maxTramerAmount.toLocaleString()} TL` : ''}
              `.trim() : 'Bilgi yok';

              const totalEquipment = car.equipment ? 
                car.equipment.safety.length + 
                car.equipment.interior.length + 
                car.equipment.exterior.length + 
                car.equipment.multimedia.length : 0;

              // Donanım verilerini hidden input'a sakla
              const equipmentData = car.equipment ? {
                title: `${car.brand} ${car.series} ${car.model}`,
                safety: car.equipment.safety,
                interior: car.equipment.interior,
                exterior: car.equipment.exterior,
                multimedia: car.equipment.multimedia
              } : null;

              const price = parseInt(car.price?.replace(/[^0-9]/g, '')) || 0;
              const km = parseInt(car.km?.replace(/[^0-9]/g, '')) || 0;
              const year = parseInt(car.year) || 0;

              return `
                <tr>
                  <td><span class="rank">${index + 1}</span></td>
                  <td>${car.brand} ${car.series} ${car.model}</td>
                  <td data-year="${year}" data-km="${km}">${car.year} / ${parseInt(car.km).toLocaleString()} km</td>
                  <td data-price="${price}">${car.price}</td>
                  <td data-overall="${car.scores.overall}" class="score ${getScoreClass(car.scores.overall)}">${car.scores.overall}</td>
                  <td data-value="${car.scores.value}" class="score ${getScoreClass(car.scores.value)}">${car.scores.value}</td>
                  <td data-condition="${car.scores.condition}" class="score ${getScoreClass(car.scores.condition)}">${car.scores.condition}</td>
                  <td class="score ${getScoreClass(car.scores.technical)}">${car.scores.technical}</td>
                  <td class="score ${getScoreClass(car.scores.equipment)}">
                    ${equipmentData ? `
                      <input type="hidden" id="equipmentData_${index}" value='${JSON.stringify(equipmentData)}'>
                      <span class="equipment-trigger" onclick="showEquipmentModal(${index})">${car.scores.equipment}</span>
                      <span class="equipment-count">(${totalEquipment})</span>
                    ` : car.scores.equipment}
                  </td>
                  <td class="damage-info">${damageInfo}</td>
                  <td><a href="${car.url}" class="link-icon" target="_blank">🔗</a></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      <div id="equipmentModal" class="modal">
        <div class="modal-content">
          <span class="modal-close" onclick="closeModal()">&times;</span>
          <div id="modalContent"></div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Data URL oluştur ve yeni sekmede aç
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  await chrome.tabs.create({ url: dataUrl });
}

// Analiz tamamlandığında HTML raporu göster
async function startAnalysis(tabId) {
  console.log('Analiz başlatılıyor...');
  
  try {
    analyzedCars = [];
    totalProcessed = 0;
    currentPage = 1;
    
    // HTML'den filtre bilgilerini al
    const tab = await chrome.tabs.get(tabId);
    const searchFilters = await chrome.scripting.executeScript({
      target: { tabId },
      func: parseFiltersFromHTML
    });
    
    // İlk sayfayı analiz et
    let pageContent = await getPageContent(tab);
    currentPage = pageContent.currentPage;
    totalPages = pageContent.totalPages;
    
    while (currentPage <= totalPages && isAnalysisRunning) {
      // Sayfadaki araçları analiz et
      for (const car of pageContent.cars) {
        if (!isAnalysisRunning) break;
        
        console.log(`[${new Date().toLocaleTimeString()}] 🚗 Araç analiz ediliyor: ${car.title}`);
        
        // Scroll simülasyonu
        await simulateScrolling(tabId, car.id);
        
        // Detay sayfasını işle
        const details = await processDetailPage(car.url, car.title, tabId, car.id);
        
        if (details) {
          // Detayları ana veri ile birleştir
          const enrichedCar = {
            ...car,
            ...details
          };
          
          // Puanları hesapla
          enrichedCar.scores = calculateScores(enrichedCar);
          
          // Sonuçlara ekle
          analyzedCars.push(enrichedCar);
          
          // Son analiz edilen aracı popup'a bildir
          chrome.runtime.sendMessage({
            action: 'updateProgress',
            data: {
              totalProcessed: ++totalProcessed,
              currentPage,
              totalPages,
              analyzedCars,
              lastAnalyzedCar: enrichedCar
            }
          });
        }
        
        // Rastgele bekleme (1.5-3 saniye)
        if (isAnalysisRunning) {
          await sleep(1500, 3000);
        }
      }
      
      // Sonraki sayfaya geç
      if (currentPage < totalPages && isAnalysisRunning) {
        
        // Sonraki sayfa butonuna tıkla
        const nextPageResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const nextButton = document.querySelector('.prevNextBut[title="Sonraki"]');
            if (nextButton) {
              nextButton.click();
              return { success: true };
            }
            return { success: false };
          }
        });

        // Sonraki sayfa butonuna tıklama kontrolü
        if (!nextPageResult[0].result.success) {
          console.log('Sonraki sayfa butonu bulunamadı veya tıklanamadı. Analiz sonlandırılıyor...');
          isAnalysisRunning = false;
          break;
        }
        
        // Sayfa yüklenme beklemesi
        await sleep(3000, 4000);
        
        // Yeni sayfayı analiz et
        pageContent = await getPageContent(tab);
        currentPage = pageContent.currentPage;
        totalPages = pageContent.totalPages;
      } else {
        break;
      }
    }
    
    // Analiz tamamlandı
    isAnalysisRunning = false;
    chrome.runtime.sendMessage({
      action: 'analysisComplete',
      data: {
        analyzedCars,
        totalProcessed,
        currentPage,
        totalPages,
        searchFilters: searchFilters[0].result
      }
    });

    // HTML raporu göster
    await showHTMLReport(analyzedCars, searchFilters[0].result);
    
  } catch (error) {
    console.error('Analiz hatası:', error);
    isAnalysisRunning = false;
    chrome.runtime.sendMessage({
      action: 'error',
      data: {
        error: error.message
      }
    });
  }
}

// Sayfa içeriğini analiz et
async function getPageContent(tab) {
  console.log(`[${new Date().toLocaleTimeString()}] 📄 Sayfa içeriği analiz ediliyor...`);
  
  const content = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (userPageLimit) => {
      console.log(userPageLimit)
      console.log('Sayfa içeriği analizi başladı');
      
      // Ana tablo kontrolü
      const table = document.querySelector('table#searchResultsTable');
      if (!table) {
        console.error('Ana tablo bulunamadı!');
        return { cars: [], totalPages: 0, currentPage: 1 };
      }
      console.log('Ana tablo bulundu:', table);

      // Toplam sayfa sayısını al
      const pageInfo = document.querySelector('.pageNavigator .mbdef')?.textContent || '';
      const totalPagesMatch = pageInfo.match(/Toplam (\d+) sayfa/);
      let totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;
      console.log('Toplam sayfa sayısı:', totalPages);
      
      // İlanları bul - reklam elementlerini atla
      const listings = Array.from(document.querySelectorAll('tr.searchResultsItem:not(.classicNativeAd)'));
      console.log('Bulunan ilan sayısı:', listings.length);
      
      const cars = listings.map(tr => {
        try {
          // Reklam kontrolü
          if (tr.closest('.classicNativeAd')) {
            console.log('Reklam elementi atlandı');
            return null;
          }

          const dataId = tr.getAttribute('data-id');
          console.log('İşlenen ilan ID:', dataId);

          // Temel bilgileri al
          const titleLink = tr.querySelector('a.classifiedTitle');
          const title = titleLink?.textContent.trim();
          const url = titleLink?.href;

          // Detaylı bilgileri al
          const cells = tr.querySelectorAll('td');
          const brand = cells[1]?.textContent.trim();
          const series = cells[2]?.textContent.trim();
          const model = cells[3]?.textContent.trim();
          const yearCell = cells[5];
          const kmCell = cells[6];
          const year = yearCell ? yearCell.textContent.trim().replace(/[^0-9]/g, '') : null;
          const km = kmCell ? kmCell.textContent.trim().replace(/[^0-9]/g, '') : null;
          const color = cells[7]?.textContent.trim();
          const price = tr.querySelector('.classified-price-container span')?.textContent.trim();
          const location = tr.querySelector('.searchResultsLocationValue')?.textContent.trim();
          const date = tr.querySelector('.searchResultsDateValue')?.textContent.trim();

          const carData = {
            id: dataId,
            url,
            title,
            brand,
            series,
            model,
            year,
            km,
            color,
            price,
            location,
            date
          };

          console.log('Toplanan araç verisi:', carData);
          return carData;

        } catch (error) {
          console.error('İlan işleme hatası:', error);
          return null;
        }
      }).filter(Boolean); // null değerleri filtrele

      console.log('Toplanan tüm araçlar:', cars);

      totalPages = userPageLimit > 0 ? Math.min(userPageLimit, totalPages) : totalPages;
      return {
        cars,
        totalPages,
        currentPage: parseInt(document.querySelector('#currentPageValue')?.value || '1')
      };
    },
    args: [userPageLimit],
  });


  if (!content || !content[0] || !content[0].result) {
    console.error('Sayfa içeriği alınamadı!');
    return { cars: [], totalPages: 0, currentPage: 1 };
  }

  console.log('Sayfa analizi sonucu:', content[0].result);
  return content[0].result;
}

// Puanlama hesaplama
function calculateScores(car) {
  console.log('Puan hesaplanıyor:', car.title);
  
  const scores = {
    overall: 0,
    value: 0,      // Fiyat/değer oranı (35%)
    condition: 0,   // Araç durumu (35%)
    technical: 0,   // Teknik özellikler (20%)
    equipment: 0    // Donanım seviyesi (10%)
  };
  
  try {
    // Fiyat/değer puanı (35%)
    const price = parseFloat(car.price?.replace(/[^0-9]/g, '')) || 0;
    const year = parseInt(car.year) || new Date().getFullYear();
    const km = parseFloat(car.km?.replace(/[^0-9]/g, '')) || 0;
    
    // Başlangıç puanı
    scores.value = 70; // Başlangıç puanını 70'e çektik, bonus puanlarla yükselebilir
    
    // Yıl bazlı değerlendirme (daha yeni araçlar daha yüksek puan)
    // 2015 ve öncesi: 0 bonus
    // Her yıl için +4 puan bonus (max 35 puan)
    const yearBonus = Math.min(35, Math.max(0, (year - 2015) * 4));
    scores.value += yearBonus;
    // console.log('Yıl bonusu:', yearBonus);
    
    // KM bazlı bonus puanlar (düşük km daha yüksek puan)
    let kmBonus = 0;
    if (km <= 25000) kmBonus = 30;
    else if (km <= 50000) kmBonus = 25;
    else if (km <= 75000) kmBonus = 20;
    else if (km <= 100000) kmBonus = 15;
    else if (km <= 125000) kmBonus = 10;
    else if (km <= 150000) kmBonus = 5;
    
    scores.value += kmBonus;
    //console.log('KM bonusu:', kmBonus);
    
    // Fiyat bazlı bonus (düşük fiyat daha yüksek puan)
    // Ortalama piyasa değeri hesabı
    const currentYear = new Date().getFullYear();
    const carAge = currentYear - year;
    const expectedBasePrice = 800000; // Baz fiyat (1 yaşında araç için)
    const expectedPrice = expectedBasePrice * Math.pow(0.85, carAge); // Her yıl için %15 değer kaybı
    
    // Fiyat karşılaştırma ve bonus hesaplama
    let priceBonus = 0;
    if (price < expectedPrice * 0.7) priceBonus = 30; // Çok iyi fiyat
    else if (price < expectedPrice * 0.8) priceBonus = 25; // İyi fiyat
    else if (price < expectedPrice * 0.9) priceBonus = 20; // Makul fiyat
    else if (price < expectedPrice) priceBonus = 15; // Normal fiyat
    else if (price < expectedPrice * 1.1) priceBonus = 10; // Biraz yüksek
    else if (price < expectedPrice * 1.2) priceBonus = 5; // Yüksek fiyat
    
    scores.value += priceBonus;
    //console.log('Fiyat bonusu:', priceBonus);
    
    // Value puanını 100'e normalize et
    scores.value = Math.min(100, scores.value);
    
    // Durum puanı (35%) - En önemli faktör
    scores.condition = 100;
    
    // Hasar durumu analizi
    if (car.damage) {
      // Kritik parçalar için ekstra ceza puanları
      const criticalParts = {
        kaput: 15,    // Motor kaputu için ekstra ceza
        tavan: 15,    // Tavan için ekstra ceza
        on: 10        // Ön parçalar için ekstra ceza
      };

      // Parça tiplerine göre puan düşüşleri
      const penalties = {
        changed: { // Değişen parçalar
          base: 8,     // Temel ceza puanı
          front: 12,   // Ön parçalar için
          critical: 15 // Kritik parçalar için (kaput, tavan)
        },
        painted: { // Boyalı parçalar
          base: 5,     // Temel ceza puanı
          front: 8,    // Ön parçalar için
          critical: 10 // Kritik parçalar için (kaput, tavan)
        },
        localPainted: { // Lokal boyalı parçalar
          base: 3,     // Temel ceza puanı
          front: 5,    // Ön parçalar için
          critical: 7  // Kritik parçalar için (kaput, tavan)
        }
      };

      let totalPenalty = 0;

      // Değişen parçaları analiz et
      if (car.damage.changedParts) {
        car.damage.changedParts.forEach(part => {
          const partText = part.toLowerCase();
          let penalty = penalties.changed.base;

          // Kritik parça kontrolü
          if (partText.includes('kaput')) {
            penalty = penalties.changed.critical + criticalParts.kaput;
          } else if (partText.includes('tavan')) {
            penalty = penalties.changed.critical + criticalParts.tavan;
          } else if (partText.includes('ön')) {
            penalty = penalties.changed.front + criticalParts.on;
          }

          totalPenalty += penalty;
        });
      }

      // Boyalı parçaları analiz et
      if (car.damage.paintedParts) {
        car.damage.paintedParts.forEach(part => {
          const partText = part.toLowerCase();
          let penalty = penalties.painted.base;

          // Kritik parça kontrolü
          if (partText.includes('kaput')) {
            penalty = penalties.painted.critical + criticalParts.kaput;
          } else if (partText.includes('tavan')) {
            penalty = penalties.painted.critical + criticalParts.tavan;
          } else if (partText.includes('ön')) {
            penalty = penalties.painted.front + criticalParts.on;
          }

          totalPenalty += penalty;
        });
      }

      // Lokal boyalı parçaları analiz et
      if (car.damage.localPaintedParts) {
        car.damage.localPaintedParts.forEach(part => {
          const partText = part.toLowerCase();
          let penalty = penalties.localPainted.base;

          // Kritik parça kontrolü
          if (partText.includes('kaput')) {
            penalty = penalties.localPainted.critical + criticalParts.kaput;
          } else if (partText.includes('tavan')) {
            penalty = penalties.localPainted.critical + criticalParts.tavan;
          } else if (partText.includes('ön')) {
            penalty = penalties.localPainted.front + criticalParts.on;
          }

          totalPenalty += penalty;
        });
      }

      // Toplam cezayı uygula (maksimum 80 puan düşüş)
      scores.condition -= Math.min(80, totalPenalty);

      // Toplam parça sayısı kontrolü
      const totalParts = (car.damage.changedParts?.length || 0) +
                        (car.damage.paintedParts?.length || 0) +
                        (car.damage.localPaintedParts?.length || 0);

      // 8'den fazla parça için ek ceza
      if (totalParts > 8) {
        scores.condition -= Math.min(15, (totalParts - 8) * 2);
      }

      // Tramer değerlendirmesi - Sadece tramer bilgisi varsa değerlendir
      if (car.damage.hasTramerInfo) {
        const maxTramer = car.damage.maxTramerAmount || 0;
        let tramerBonus = 0;

        if (maxTramer === 0) {
          tramerBonus = 20; // Tramersiz araç
        } else if (maxTramer <= 5000) {
          tramerBonus = 15; // Çok düşük tramer
        } else if (maxTramer <= 10000) {
          tramerBonus = 10; // Düşük tramer
        } else if (maxTramer <= 20000) {
          tramerBonus = 5; // Makul tramer
        }

        scores.condition += tramerBonus;
        //console.log('Tramer bilgisi mevcut, bonus:', tramerBonus);
      } else {
        //console.log('Tramer bilgisi bulunamadı, bonus uygulanmadı');
      }

      // Tramer kaydı analizi
      const tramerTotal = parseFloat(car.damage?.tramerTotal?.replace(/[^0-9]/g, '')) || 0;
      if (tramerTotal > 0) {
        // Her 1000 TL için 2 puan, maksimum 40 puan düşüş
        const tramerPenalty = Math.min(40, (tramerTotal / 1000) * 2);
        scores.condition -= tramerPenalty;
      }

      // Ağır hasar kaydı kontrolü
      if (car.damage.heavyDamage === 'Var' || car.damage.heavyDamage === 'Evet') {
        scores.condition -= 50;
      }
    }
    
    // Teknik puan (20%)
    scores.technical = 70;
    
    // Motor gücü
    if (car.technical?.engine?.power) {
      const powerMatch = car.technical.engine.power.match(/(\d+)/);
      const powerValue = powerMatch ? parseFloat(powerMatch[1]) : 0;
      scores.technical += Math.min(20, powerValue / 15);
    }
    
    // Vites tipi
    if (car.technical?.transmission?.type?.includes('Otomatik')) {
      scores.technical += 8;
    }
    
    // Yakıt tipi bonusları
    if (car.technical?.fuel?.type) {
      const fuelType = car.technical.fuel.type.toLowerCase();
      if (fuelType.includes('dizel')) {
        scores.technical += 7;
      } else if (fuelType.includes('hibrit')) {
        scores.technical += 12;
      } else if (fuelType.includes('elektrik')) {
        scores.technical += 15;
      }
    }

    // Donanım puanı (10%)
    scores.equipment = 60;
    const safetyEquipCount = car.equipment?.safety?.length || 0;
    const exteriorEquipCount = car.equipment?.exterior?.length || 0;
    const interiorEquipCount = car.equipment?.interior?.length || 0;
    const multimediaEquipCount = car.equipment?.multimedia?.length || 0;
    
    // Güvenlik donanımları daha önemli
    scores.equipment += Math.min(20, safetyEquipCount * 2);
    scores.equipment += Math.min(10, exteriorEquipCount);
    scores.equipment += Math.min(10, interiorEquipCount);
    scores.equipment += Math.min(10, multimediaEquipCount);

    // Puanları normalize et (0-100 arası)
    Object.keys(scores).forEach(key => {
      scores[key] = Math.max(0, Math.min(100, Math.round(scores[key])));
    });

    // Genel puan hesapla (ağırlıklı ortalama)
    scores.overall = Math.round(
      scores.value * 0.35 +      // Fiyat/değer: %35
      scores.condition * 0.35 +   // Durum: %35
      scores.technical * 0.20 +   // Teknik: %20
      scores.equipment * 0.10     // Donanım: %10
    );

    //console.log('Hesaplanan puanlar:', scores);
    return scores;
  } catch (error) {
    console.error('Puan hesaplama hatası:', error);
    return { overall: 0, value: 0, condition: 0, technical: 0, equipment: 0 };
  }
}