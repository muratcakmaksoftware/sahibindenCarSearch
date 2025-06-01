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
const requiredApis = ['scripting', 'cookies', 'tabs'];
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
        const item = document.querySelector(`tr[data-id="${id}"]:not(.GoogleActiveViewElement) a.classifiedTitle`);
        
        // Eğer element reklam değilse ve bulunduysa tıkla
        if (item && !item.closest('.GoogleActiveViewElement')) {
          item.click();
          return true;
        }
        
        console.log('Element reklam olduğu için atlandı veya bulunamadı');
        return false;
      },
      args: [carId]
    });

    if (!clickResult || !clickResult[0] || !clickResult[0].result) {
      console.error('İlana tıklanamadı veya reklam elementi!');
      return null;
    }
    
    // Sayfa yüklenme beklemesi
    await sleep(1000, 1500);
    
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
              multimedia: [],
              other: []
            };

            document.querySelectorAll('.classifiedInfoList .feature-details li').forEach(item => {
              const text = item.textContent.trim();
              
              if (text.match(/ABS|ESP|Yastık|Fren|Kontrol|Güvenlik/i)) {
                equipment.safety.push(text);
              } else if (text.match(/Far|Jant|Sis|Ayna|Cam|Sunroof/i)) {
                equipment.exterior.push(text);
              } else if (text.match(/Klima|Koltuk|Döşeme|Direksiyon|Isıtma/i)) {
                equipment.interior.push(text);
              } else if (text.match(/USB|Bluetooth|Navigasyon|Ekran|Ses/i)) {
                equipment.multimedia.push(text);
              } else {
                equipment.other.push(text);
              }
            });

            console.log('Donanım bilgileri:', equipment);
            return equipment;
          } catch (error) {
            console.error('Donanım bilgileri alınamadı:', error);
            return { safety: [], exterior: [], interior: [], multimedia: [], other: [] };
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
    await sleep(1000, 1500);
    
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
    
    await sleep(1000, 1500);
    return null;
  }
}

async function startAnalysis(tabId) {
  console.log('Analiz başlatılıyor...');
  
  try {
    analyzedCars = [];
    totalProcessed = 0;
    currentPage = 1;
    
    // İlk sayfayı analiz et
    const tab = await chrome.tabs.get(tabId);
    let pageContent = await getPageContent(tab);
    
    // Sayfa limitini kontrol et
    const maxPages = userPageLimit > 0 ? Math.min(userPageLimit, pageContent.totalPages) : pageContent.totalPages;
    totalPages = pageContent.totalPages; // Toplam mevcut sayfa sayısı
    
    console.log(`Toplam sayfa: ${pageContent.totalPages}, İşlenecek sayfa: ${maxPages}`);
    
    while (currentPage <= maxPages && isAnalysisRunning) {
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
        currentPage++;
        
        // Sonraki sayfa butonuna tıkla
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const nextButton = document.querySelector('.prevNextBut[title="Sonraki"]');
            if (nextButton) {
              nextButton.click();
              return true;
            }
            return false;
          }
        });
        
        // Sayfa yüklenme beklemesi
        await sleep(1000, 1500);
        
        // Yeni sayfayı analiz et
        pageContent = await getPageContent(tab);
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
        totalPages
      }
    });
    
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
    func: () => {
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
      const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;
      console.log('Toplam sayfa sayısı:', totalPages);
      
      // İlanları bul - reklam elementlerini atla
      const listings = Array.from(document.querySelectorAll('tr.searchResultsItem:not(.GoogleActiveViewElement)'));
      console.log('Bulunan ilan sayısı:', listings.length);
      
      const cars = listings.map(tr => {
        try {
          // Reklam kontrolü
          if (tr.closest('.GoogleActiveViewElement')) {
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
      return {
        cars,
        totalPages,
        currentPage: parseInt(document.querySelector('#currentPageValue')?.value || '1')
      };
    }
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
    value: 0,      // Fiyat/değer oranı (30%)
    condition: 0,   // Araç durumu (35%)
    technical: 0,   // Teknik özellikler (20%)
    equipment: 0,   // Donanım seviyesi (10%)
    seller: 0       // Satıcı güvenilirliği (5%)
  };
  
  try {
    // Fiyat/değer puanı (30%)
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
    console.log('Yıl bonusu:', yearBonus);
    
    // KM bazlı bonus puanlar (düşük km daha yüksek puan)
    let kmBonus = 0;
    if (km <= 25000) kmBonus = 30;
    else if (km <= 50000) kmBonus = 25;
    else if (km <= 75000) kmBonus = 20;
    else if (km <= 100000) kmBonus = 15;
    else if (km <= 125000) kmBonus = 10;
    else if (km <= 150000) kmBonus = 5;
    
    scores.value += kmBonus;
    console.log('KM bonusu:', kmBonus);
    
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
    console.log('Fiyat bonusu:', priceBonus);
    
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
        console.log('Tramer bilgisi mevcut, bonus:', tramerBonus);
      } else {
        console.log('Tramer bilgisi bulunamadı, bonus uygulanmadı');
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

    // Satıcı puanı (5%)
    scores.seller = 70;
    if (car.seller?.type?.includes('Yetkili')) {
      scores.seller += 15;
    }
    if (car.seller?.rating) {
      const rating = parseFloat(car.seller.rating) || 0;
      scores.seller += Math.min(15, rating * 3);
    }
    if (car.seller?.memberSince) {
      const memberYears = new Date().getFullYear() - parseInt(car.seller.memberSince);
      scores.seller += Math.min(10, memberYears * 2);
    }

    // Puanları normalize et (0-100 arası)
    Object.keys(scores).forEach(key => {
      scores[key] = Math.max(0, Math.min(100, Math.round(scores[key])));
    });

    // Genel puan hesapla (ağırlıklı ortalama)
    scores.overall = Math.round(
      scores.value * 0.30 +      // Fiyat/değer: %30
      scores.condition * 0.35 +   // Durum: %35 (artırıldı)
      scores.technical * 0.20 +   // Teknik: %20
      scores.equipment * 0.10 +   // Donanım: %10 (azaltıldı)
      scores.seller * 0.05        // Satıcı: %5 (azaltıldı)
    );

    console.log('Hesaplanan puanlar:', scores);
    return scores;
  } catch (error) {
    console.error('Puan hesaplama hatası:', error);
    return { overall: 0, value: 0, condition: 0, technical: 0, equipment: 0, seller: 0 };
  }
} 