/**
 * Editorial ownership/control of a feed. This is PROVENANCE, not a quality
 * score: the platform's job is seeing who says what, so official state
 * mouthpieces are valuable primary sources for narrative attribution — as
 * long as they are never presented as independent reporting.
 *
 * - independent:        privately owned, editorially independent
 * - public-broadcaster: state-funded but editorially independent (BBC, DW)
 * - state-media:        state-controlled messaging (Xinhua, RT, Sputnik)
 */
export type FeedOwnership = 'independent' | 'public-broadcaster' | 'state-media';

export interface RssFeedEntry {
  name: string;
  url: string;
  category: string;
  tier: 1 | 2 | 3;
  language: string;
  region?: string;
  /** Defaults to 'independent' when omitted. */
  ownership?: FeedOwnership;
  /**
   * Who the outlet talks to. The domestic/international split is the point of
   * carrying state media at all: what RT tells the world and what RIA Novosti
   * tells Russians about the same event routinely differ — that divergence is
   * primary narrative data.
   */
  audience?: 'domestic' | 'international';
}

export const RSS_FEED_CATALOG: Record<string, RssFeedEntry[]> = {
  // ---------------------------------------------------------------------------
  // WORLD NEWS
  // ---------------------------------------------------------------------------
  world_news: [
    {
      name: 'BBC World',
      url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
      category: 'world_news',
      tier: 1,
      language: 'en',
      region: 'global',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Al Jazeera',
      url: 'https://www.aljazeera.com/xml/rss/all.xml',
      category: 'world_news',
      tier: 1,
      language: 'en',
      region: 'global',
      ownership: 'public-broadcaster',
    },
    {
      name: 'France 24 - World',
      url: 'https://www.france24.com/en/rss',
      category: 'world_news',
      tier: 1,
      language: 'en',
      region: 'global',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Guardian - World',
      url: 'https://www.theguardian.com/world/rss',
      category: 'world_news',
      tier: 1,
      language: 'en',
      region: 'global',
    },
    {
      name: 'DW News',
      url: 'https://rss.dw.com/rdf/rss-en-all',
      category: 'world_news',
      tier: 1,
      language: 'en',
      region: 'global',
      ownership: 'public-broadcaster',
    },
    {
      name: 'NPR News',
      url: 'https://feeds.npr.org/1001/rss.xml',
      category: 'world_news',
      tier: 1,
      language: 'en',
      region: 'us',
      ownership: 'public-broadcaster',
    },
    {
      name: 'CBS News',
      url: 'https://www.cbsnews.com/latest/rss/main',
      category: 'world_news',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'ABC News International',
      url: 'https://abcnews.go.com/abcnews/internationalheadlines',
      category: 'world_news',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'The Independent - World',
      url: 'https://www.independent.co.uk/news/world/rss',
      category: 'world_news',
      tier: 2,
      language: 'en',
      region: 'uk',
    },
    {
      name: 'UN News',
      url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
      category: 'world_news',
      tier: 2,
      language: 'en',
      region: 'global',
    },
    {
      name: 'Christian Science Monitor',
      url: 'https://rss.csmonitor.com/feeds/csm',
      category: 'world_news',
      tier: 2,
      language: 'en',
      region: 'global',
    },
    {
      name: 'VOA News',
      url: 'https://www.voanews.com/api/',
      category: 'world_news',
      tier: 2,
      language: 'en',
      region: 'global',
    },
    {
      name: 'The World via PRI',
      url: 'https://latest-edition.feed.theworld.org/',
      category: 'world_news',
      tier: 3,
      language: 'en',
      region: 'global',
    },
  ],

  // ---------------------------------------------------------------------------
  // US POLITICS
  // ---------------------------------------------------------------------------
  us_politics: [
    {
      name: 'NPR - Politics',
      url: 'https://feeds.npr.org/1014/rss.xml',
      category: 'us_politics',
      tier: 1,
      language: 'en',
      region: 'us',
      ownership: 'public-broadcaster',
    },
    {
      name: 'PBS NewsHour',
      url: 'https://www.pbs.org/newshour/feeds/rss/headlines',
      category: 'us_politics',
      tier: 1,
      language: 'en',
      region: 'us',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Politico',
      url: 'https://rss.politico.com/politics-news.xml',
      category: 'us_politics',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'The Hill',
      url: 'https://thehill.com/feed/',
      category: 'us_politics',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Washington Post - Politics',
      url: 'https://feeds.washingtonpost.com/rss/politics',
      category: 'us_politics',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Roll Call',
      url: 'https://www.rollcall.com/feed/',
      category: 'us_politics',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Axios',
      url: 'https://api.axios.com/feed/',
      category: 'us_politics',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'ProPublica',
      url: 'https://feeds.propublica.org/propublica/main',
      category: 'us_politics',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'FiveThirtyEight',
      url: 'https://fivethirtyeight.com/features/feed/',
      category: 'us_politics',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Lawfare',
      url: 'https://www.lawfaremedia.org/feeds/articles',
      category: 'us_politics',
      tier: 2,
      language: 'en',
      region: 'us',
    },
  ],

  // ---------------------------------------------------------------------------
  // EUROPE
  // ---------------------------------------------------------------------------
  europe: [
    {
      name: 'EuroNews',
      url: 'https://www.euronews.com/rss',
      category: 'europe',
      tier: 1,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'Le Monde English',
      url: 'https://www.lemonde.fr/en/international/rss_full.xml',
      category: 'europe',
      tier: 1,
      language: 'en',
      region: 'france',
    },
    {
      name: 'DW - Europe',
      url: 'https://rss.dw.com/rdf/rss-en-eu',
      category: 'europe',
      tier: 1,
      language: 'en',
      region: 'europe',
      ownership: 'public-broadcaster',
    },
    {
      name: 'BBC - Europe',
      url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
      category: 'europe',
      tier: 1,
      language: 'en',
      region: 'europe',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Guardian - Europe',
      url: 'https://www.theguardian.com/world/europe-news/rss',
      category: 'europe',
      tier: 2,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'Politico EU',
      url: 'https://www.politico.eu/feed/',
      category: 'europe',
      tier: 1,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'EU Observer',
      url: 'https://euobserver.com/feed/',
      category: 'europe',
      tier: 2,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'The Local - Europe',
      url: 'https://www.thelocal.com/feeds/rss.php',
      category: 'europe',
      tier: 3,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'RFERL - Europe',
      url: 'https://www.rferl.org/api/',
      category: 'europe',
      tier: 2,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'Balkan Insight',
      url: 'https://balkaninsight.com/feed/',
      category: 'europe',
      tier: 3,
      language: 'en',
      region: 'balkans',
    },
    {
      name: 'France 24 - Europe',
      url: 'https://www.france24.com/en/europe/rss',
      category: 'europe',
      tier: 2,
      language: 'en',
      region: 'europe',
      ownership: 'public-broadcaster',
    },
  ],

  // ---------------------------------------------------------------------------
  // MIDDLE EAST
  // ---------------------------------------------------------------------------
  middle_east: [
    {
      name: 'Al Jazeera - Middle East',
      url: 'https://www.aljazeera.com/xml/rss/all.xml',
      category: 'middle_east',
      tier: 1,
      language: 'en',
      region: 'middle_east',
      ownership: 'public-broadcaster',
    },
    {
      name: 'BBC - Middle East',
      url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
      category: 'middle_east',
      tier: 1,
      language: 'en',
      region: 'middle_east',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Al-Monitor',
      url: 'https://www.al-monitor.com/rss',
      category: 'middle_east',
      tier: 1,
      language: 'en',
      region: 'middle_east',
    },
    {
      name: 'Middle East Eye',
      url: 'https://www.middleeasteye.net/rss',
      category: 'middle_east',
      tier: 2,
      language: 'en',
      region: 'middle_east',
    },
    {
      name: 'The New Arab',
      url: 'https://www.newarab.com/rss',
      category: 'middle_east',
      tier: 2,
      language: 'en',
      region: 'middle_east',
    },
    {
      name: 'Iran International',
      url: 'https://www.iranintl.com/en/feed',
      category: 'middle_east',
      tier: 2,
      language: 'en',
      region: 'iran',
    },
    {
      name: 'Times of Israel',
      url: 'https://www.timesofisrael.com/feed/',
      category: 'middle_east',
      tier: 2,
      language: 'en',
      region: 'israel',
    },
    {
      name: 'Daily Sabah',
      url: 'https://www.dailysabah.com/rssFeed/homepage',
      category: 'middle_east',
      tier: 2,
      language: 'en',
      region: 'turkey',
    },
  ],

  // ---------------------------------------------------------------------------
  // ASIA PACIFIC
  // ---------------------------------------------------------------------------
  asia_pacific: [
    {
      name: 'Nikkei Asia',
      url: 'https://asia.nikkei.com/rss/feed/nar',
      category: 'asia_pacific',
      tier: 1,
      language: 'en',
      region: 'asia',
    },
    {
      name: 'The Diplomat',
      url: 'https://thediplomat.com/feed/',
      category: 'asia_pacific',
      tier: 1,
      language: 'en',
      region: 'asia',
    },
    {
      name: 'South China Morning Post',
      url: 'https://www.scmp.com/rss/91/feed',
      category: 'asia_pacific',
      tier: 1,
      language: 'en',
      region: 'china',
    },
    {
      name: 'BBC - Asia',
      url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
      category: 'asia_pacific',
      tier: 1,
      language: 'en',
      region: 'asia',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Channel News Asia',
      url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
      category: 'asia_pacific',
      tier: 1,
      language: 'en',
      region: 'singapore',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Japan Times',
      url: 'https://www.japantimes.co.jp/feed/',
      category: 'asia_pacific',
      tier: 2,
      language: 'en',
      region: 'japan',
    },
    {
      name: 'Straits Times',
      url: 'https://www.straitstimes.com/news/asia/rss.xml',
      category: 'asia_pacific',
      tier: 2,
      language: 'en',
      region: 'singapore',
    },
    {
      name: 'Hindustan Times',
      url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
      category: 'asia_pacific',
      tier: 2,
      language: 'en',
      region: 'india',
    },
    {
      name: 'ABC Australia',
      url: 'https://www.abc.net.au/news/feed/2942460/rss.xml',
      category: 'asia_pacific',
      tier: 2,
      language: 'en',
      region: 'australia',
      ownership: 'public-broadcaster',
    },
    {
      name: 'NHK World',
      url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
      category: 'asia_pacific',
      tier: 2,
      language: 'en',
      region: 'japan',
      ownership: 'public-broadcaster',
    },
    {
      name: 'Rappler',
      url: 'https://www.rappler.com/feed/',
      category: 'asia_pacific',
      tier: 3,
      language: 'en',
      region: 'philippines',
    },
  ],

  // ---------------------------------------------------------------------------
  // AFRICA
  // ---------------------------------------------------------------------------
  africa: [
    {
      name: 'BBC - Africa',
      url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
      category: 'africa',
      tier: 1,
      language: 'en',
      region: 'africa',
      ownership: 'public-broadcaster',
    },
    {
      name: 'AllAfrica',
      url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
      category: 'africa',
      tier: 1,
      language: 'en',
      region: 'africa',
    },
    {
      name: 'Mail & Guardian',
      url: 'https://mg.co.za/feed/',
      category: 'africa',
      tier: 2,
      language: 'en',
      region: 'south_africa',
    },
    {
      name: 'Al Jazeera - Africa',
      url: 'https://www.aljazeera.com/xml/rss/all.xml',
      category: 'africa',
      tier: 2,
      language: 'en',
      region: 'africa',
      ownership: 'public-broadcaster',
    },
    {
      name: 'The Africa Report',
      url: 'https://www.theafricareport.com/feed/',
      category: 'africa',
      tier: 2,
      language: 'en',
      region: 'africa',
    },
    {
      name: 'Nation Africa',
      url: 'https://nation.africa/kenya/rss.xml',
      category: 'africa',
      tier: 3,
      language: 'en',
      region: 'kenya',
    },
    {
      name: 'RFI Africa',
      url: 'https://www.rfi.fr/en/africa/rss',
      category: 'africa',
      tier: 3,
      language: 'en',
      region: 'africa',
    },
  ],

  // ---------------------------------------------------------------------------
  // LATIN AMERICA
  // ---------------------------------------------------------------------------
  latin_america: [
    {
      name: 'BBC - Latin America',
      url: 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml',
      category: 'latin_america',
      tier: 1,
      language: 'en',
      region: 'latin_america',
      ownership: 'public-broadcaster',
    },
    {
      name: 'InSight Crime',
      url: 'https://insightcrime.org/feed/',
      category: 'latin_america',
      tier: 1,
      language: 'en',
      region: 'latin_america',
    },
    {
      name: 'Americas Quarterly',
      url: 'https://americasquarterly.org/feed/',
      category: 'latin_america',
      tier: 2,
      language: 'en',
      region: 'latin_america',
    },
    {
      name: 'Buenos Aires Times',
      url: 'https://www.batimes.com.ar/feed',
      category: 'latin_america',
      tier: 2,
      language: 'en',
      region: 'argentina',
    },
    {
      name: 'MercoPress',
      url: 'https://en.mercopress.com/rss',
      category: 'latin_america',
      tier: 2,
      language: 'en',
      region: 'latin_america',
    },
    {
      name: 'Brazil Wire',
      url: 'https://www.brasilwire.com/feed/',
      category: 'latin_america',
      tier: 3,
      language: 'en',
      region: 'brazil',
    },
    {
      name: 'Dialogo Americas',
      url: 'https://dialogo-americas.com/feed/',
      category: 'latin_america',
      tier: 3,
      language: 'en',
      region: 'latin_america',
    },
  ],

  // ---------------------------------------------------------------------------
  // TECHNOLOGY
  // ---------------------------------------------------------------------------
  technology: [
    {
      name: 'TechCrunch',
      url: 'https://techcrunch.com/feed/',
      category: 'technology',
      tier: 1,
      language: 'en',
    },
    {
      name: 'The Verge',
      url: 'https://www.theverge.com/rss/index.xml',
      category: 'technology',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Ars Technica',
      url: 'https://feeds.arstechnica.com/arstechnica/index',
      category: 'technology',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Hacker News (Best)',
      url: 'https://hnrss.org/best',
      category: 'technology',
      tier: 1,
      language: 'en',
    },
    {
      name: 'MIT Technology Review',
      url: 'https://www.technologyreview.com/feed/',
      category: 'technology',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Wired',
      url: 'https://www.wired.com/feed/rss',
      category: 'technology',
      tier: 1,
      language: 'en',
    },
    {
      name: 'ZDNet',
      url: 'https://www.zdnet.com/news/rss.xml',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Engadget',
      url: 'https://www.engadget.com/rss.xml',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Gizmodo',
      url: 'https://gizmodo.com/feed',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'The Register',
      url: 'https://www.theregister.com/headlines.atom',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Slashdot',
      url: 'https://rss.slashdot.org/Slashdot/slashdotMain',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'IEEE Spectrum',
      url: 'https://spectrum.ieee.org/feeds/feed.rss',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Krebs on Security',
      url: 'https://krebsonsecurity.com/feed/',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Schneier on Security',
      url: 'https://www.schneier.com/feed/',
      category: 'technology',
      tier: 2,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // FINANCE
  // ---------------------------------------------------------------------------
  finance: [
    {
      name: 'CNBC - Top News',
      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'CNBC - Finance',
      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'MarketWatch - Top Stories',
      url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'MarketWatch - Markets',
      url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/',
      category: 'finance',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Financial Times',
      url: 'https://www.ft.com/rss/home',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Yahoo Finance',
      url: 'https://finance.yahoo.com/news/rssindex',
      category: 'finance',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Economist',
      url: 'https://www.economist.com/finance-and-economics/rss.xml',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Wall Street Journal - Markets',
      url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Wall Street Journal - Business',
      url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
      category: 'finance',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Seeking Alpha',
      url: 'https://seekingalpha.com/market_currents.xml',
      category: 'finance',
      tier: 2,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // CRYPTO
  // ---------------------------------------------------------------------------
  crypto: [
    {
      name: 'CoinDesk',
      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      category: 'crypto',
      tier: 1,
      language: 'en',
    },
    {
      name: 'The Block',
      url: 'https://www.theblock.co/rss.xml',
      category: 'crypto',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Decrypt',
      url: 'https://decrypt.co/feed',
      category: 'crypto',
      tier: 1,
      language: 'en',
    },
    {
      name: 'CoinTelegraph',
      url: 'https://cointelegraph.com/rss',
      category: 'crypto',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Bitcoin Magazine',
      url: 'https://bitcoinmagazine.com/feed',
      category: 'crypto',
      tier: 1,
      language: 'en',
    },
    {
      name: 'CryptoSlate',
      url: 'https://cryptoslate.com/feed/',
      category: 'crypto',
      tier: 2,
      language: 'en',
    },
    {
      name: 'The Defiant',
      url: 'https://thedefiant.io/feed',
      category: 'crypto',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Blockworks',
      url: 'https://blockworks.co/feed/',
      category: 'crypto',
      tier: 2,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // DEFENSE & INTELLIGENCE
  // ---------------------------------------------------------------------------
  defense_intel: [
    {
      name: 'Defense One',
      url: 'https://www.defenseone.com/rss/all/',
      category: 'defense_intel',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'The War Zone',
      url: 'https://www.thedrive.com/the-war-zone/rss',
      category: 'defense_intel',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Bellingcat',
      url: 'https://www.bellingcat.com/feed/',
      category: 'defense_intel',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Military Times',
      url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/category/news/?outputType=xml',
      category: 'defense_intel',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Breaking Defense',
      url: 'https://breakingdefense.com/feed/',
      category: 'defense_intel',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Defense News',
      url: 'https://www.defensenews.com/arc/outboundfeeds/rss/category/news/?outputType=xml',
      category: 'defense_intel',
      tier: 1,
      language: 'en',
    },
    {
      name: 'CSIS - Defense',
      url: 'https://www.csis.org/rss.xml',
      category: 'defense_intel',
      tier: 2,
      language: 'en',
    },
    {
      name: 'War on the Rocks',
      url: 'https://warontherocks.com/feed/',
      category: 'defense_intel',
      tier: 2,
      language: 'en',
    },
    {
      name: 'The Intercept',
      url: 'https://theintercept.com/feed/?rss',
      category: 'defense_intel',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Just Security',
      url: 'https://www.justsecurity.org/feed/',
      category: 'defense_intel',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Small Wars Journal',
      url: 'https://smallwarsjournal.com/feed',
      category: 'defense_intel',
      tier: 3,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // SCIENCE & HEALTH
  // ---------------------------------------------------------------------------
  science_health: [
    {
      name: 'Nature News',
      url: 'https://www.nature.com/nature.rss',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Science Daily',
      url: 'https://www.sciencedaily.com/rss/all.xml',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
    {
      name: 'WHO - News',
      url: 'https://www.who.int/rss-feeds/news-english.xml',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
    {
      name: 'CDC - Newsroom',
      url: 'https://tools.cdc.gov/api/v2/resources/media/404952.rss',
      category: 'science_health',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'New Scientist',
      url: 'https://www.newscientist.com/feed/home/',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
    {
      name: 'The Lancet',
      url: 'https://www.thelancet.com/rssfeed/lancet_current.xml',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
    {
      name: 'STAT News',
      url: 'https://www.statnews.com/feed/',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Phys.org',
      url: 'https://phys.org/rss-feed/',
      category: 'science_health',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Scientific American',
      url: 'https://www.scientificamerican.com/platform/syndication/rss/',
      category: 'science_health',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Live Science',
      url: 'https://www.livescience.com/feeds/all',
      category: 'science_health',
      tier: 2,
      language: 'en',
    },
    {
      name: 'NIH News',
      url: 'https://www.nih.gov/news-releases/feed.xml',
      category: 'science_health',
      tier: 2,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Science Magazine',
      url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science',
      category: 'science_health',
      tier: 1,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // THINK TANKS
  // ---------------------------------------------------------------------------
  think_tanks: [
    {
      name: 'Foreign Policy',
      url: 'https://foreignpolicy.com/feed/',
      category: 'think_tanks',
      tier: 1,
      language: 'en',
    },
    {
      name: 'CSIS',
      url: 'https://www.csis.org/rss.xml',
      category: 'think_tanks',
      tier: 1,
      language: 'en',
    },
    {
      name: 'RAND',
      url: 'https://www.rand.org/news.xml',
      category: 'think_tanks',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Atlantic Council',
      url: 'https://www.atlanticcouncil.org/feed/',
      category: 'think_tanks',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Stimson Center',
      url: 'https://www.stimson.org/feed/',
      category: 'think_tanks',
      tier: 3,
      language: 'en',
    },
    {
      name: 'International Crisis Group',
      url: 'https://www.crisisgroup.org/rss.xml',
      category: 'think_tanks',
      tier: 1,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // ENERGY
  // ---------------------------------------------------------------------------
  energy: [
    {
      name: 'OilPrice.com',
      url: 'https://oilprice.com/rss/main',
      category: 'energy',
      tier: 1,
      language: 'en',
    },
    {
      name: 'World Nuclear News',
      url: 'https://world-nuclear-news.org/rss',
      category: 'energy',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Renewable Energy World',
      url: 'https://www.renewableenergyworld.com/feed/',
      category: 'energy',
      tier: 1,
      language: 'en',
    },
    {
      name: 'Utility Dive',
      url: 'https://www.utilitydive.com/feeds/news/',
      category: 'energy',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Energy Intelligence',
      url: 'https://www.energyintel.com/index.rss',
      category: 'energy',
      tier: 2,
      language: 'en',
    },
    {
      name: 'CleanTechnica',
      url: 'https://cleantechnica.com/feed/',
      category: 'energy',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Carbon Brief',
      url: 'https://www.carbonbrief.org/feed/',
      category: 'energy',
      tier: 2,
      language: 'en',
    },
    {
      name: 'Electrek',
      url: 'https://electrek.co/feed/',
      category: 'energy',
      tier: 2,
      language: 'en',
    },
  ],

  // ---------------------------------------------------------------------------
  // GOVERNMENT
  // ---------------------------------------------------------------------------
  government: [
    {
      name: 'US State Department',
      url: 'https://www.state.gov/rss-feed/press-releases/feed/',
      category: 'government',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Federal Reserve - Press Releases',
      url: 'https://www.federalreserve.gov/feeds/press_all.xml',
      category: 'government',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'SEC - Press Releases',
      url: 'https://www.sec.gov/rss/news/press.xml',
      category: 'government',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'EU Newsroom',
      url: 'https://ec.europa.eu/commission/presscorner/api/rss',
      category: 'government',
      tier: 1,
      language: 'en',
      region: 'europe',
    },
    {
      name: 'US Department of Defense',
      url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10',
      category: 'government',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'UK Government',
      url: 'https://www.gov.uk/search/news-and-communications.atom',
      category: 'government',
      tier: 2,
      language: 'en',
      region: 'uk',
    },
    {
      name: 'GAO Reports',
      url: 'https://www.gao.gov/rss/reports.xml',
      category: 'government',
      tier: 2,
      language: 'en',
      region: 'us',
    },
  ],

  // ---------------------------------------------------------------------------
  // FACT-CHECK / DEBUNKING — IFCN-aligned fact-checkers. High value for
  // narrative provenance: surfaces existing debunks of a circulating claim.
  // ---------------------------------------------------------------------------
  fact_check: [
    {
      name: 'Snopes',
      url: 'https://www.snopes.com/feed/',
      category: 'fact_check',
      tier: 1,
      language: 'en',
      region: 'global',
    },
    {
      name: 'PolitiFact',
      url: 'https://www.politifact.com/rss/all/',
      category: 'fact_check',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'FactCheck.org',
      url: 'https://www.factcheck.org/feed/',
      category: 'fact_check',
      tier: 1,
      language: 'en',
      region: 'us',
    },
    {
      name: 'Full Fact',
      url: 'https://fullfact.org/feed/all/',
      category: 'fact_check',
      tier: 1,
      language: 'en',
      region: 'uk',
    },
    {
      name: 'Lead Stories',
      url: 'https://leadstories.com/atom.xml',
      category: 'fact_check',
      tier: 2,
      language: 'en',
      region: 'global',
    },
    {
      name: 'EUvsDisinfo',
      url: 'https://euvsdisinfo.eu/feed/',
      category: 'fact_check',
      tier: 1,
      language: 'en',
      region: 'europe',
    },
  ],

  // ---------------------------------------------------------------------------
  // OFFICIAL STATE MEDIA
  //
  // Primary sources for what governments tell the world (these are the
  // English-language, outward-facing arms). The value is comparative: when
  // Xinhua, RT, and Reuters describe the same event differently, THAT GAP is
  // the narrative signal. Every entry is tagged ownership: 'state-media' and
  // must surface with that provenance everywhere downstream.
  //
  // All URLs verified live 2026-07-18. Global Times had no working RSS;
  // Xinhua's english RSS is abandoned (last items 2018) and China Daily's
  // items carry no dates (would read as perpetually fresh) — China News
  // Service (ecns.cn, the second official state wire) is dated and current.
  // Reuters/AFP have no public RSS (wire services); their stories reach us
  // via GDELT and the wire copy carried by BBC/DW/France 24.
  // ---------------------------------------------------------------------------
  state_media: [
    {
      name: 'China News Service',
      url: 'https://www.ecns.cn/rss/rss.xml',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'china',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'CGTN - World',
      url: 'https://www.cgtn.com/subscribe/rss/section/world.xml',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'china',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'CGTN - China',
      url: 'https://www.cgtn.com/subscribe/rss/section/china.xml',
      category: 'state_media',
      tier: 2,
      language: 'en',
      region: 'china',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'RT News',
      url: 'https://www.rt.com/rss/news/',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'russia',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'Sputnik',
      url: 'https://sputnikglobe.com/export/rss2/archive/index.xml',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'russia',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'TASS',
      url: 'https://tass.com/rss/v2.xml',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'russia',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'Press TV',
      url: 'https://www.presstv.ir/rss.xml',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'iran',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'teleSUR English',
      url: 'https://www.telesurenglish.net/feed',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'venezuela',
      ownership: 'state-media',
      audience: 'international',
    },
    {
      name: 'Anadolu Agency',
      url: 'https://www.aa.com.tr/en/rss/default?cat=guncel',
      category: 'state_media',
      tier: 1,
      language: 'en',
      region: 'turkey',
      ownership: 'state-media',
      audience: 'international',
    },

    // -- Domestic-audience feeds (non-English, machine-translated at ingest) --
    // What these states tell their OWN populations, vs the international feeds
    // above. TASS appears in both audiences deliberately: one agency, two
    // messages. All URLs verified live 2026-07-19; headlines dated same-day.
    // (Chinese domestic RSS is effectively extinct — no working dated feed
    // found for Xinhua/People's Daily domestic editions.)
    {
      name: 'RIA Novosti',
      url: 'https://ria.ru/export/rss2/archive/index.xml',
      category: 'state_media',
      tier: 1,
      language: 'ru',
      region: 'russia',
      ownership: 'state-media',
      audience: 'domestic',
    },
    {
      name: 'TASS (Russian)',
      url: 'https://tass.ru/rss/v2.xml',
      category: 'state_media',
      tier: 1,
      language: 'ru',
      region: 'russia',
      ownership: 'state-media',
      audience: 'domestic',
    },
    {
      name: 'Lenta.ru',
      url: 'https://lenta.ru/rss',
      category: 'state_media',
      tier: 1,
      language: 'ru',
      region: 'russia',
      ownership: 'state-media',
      audience: 'domestic',
    },
    {
      name: 'Rossiyskaya Gazeta',
      url: 'https://rg.ru/xml/index.xml',
      category: 'state_media',
      tier: 1,
      language: 'ru',
      region: 'russia',
      ownership: 'state-media',
      audience: 'domestic',
    },
    {
      name: 'IRNA',
      url: 'https://www.irna.ir/rss',
      category: 'state_media',
      tier: 1,
      language: 'fa',
      region: 'iran',
      ownership: 'state-media',
      audience: 'domestic',
    },
  ],

  // ---------------------------------------------------------------------------
  // GLOBAL SOUTH / REGIONAL BALANCE
  // Independent outlets filling regions the catalog under-covered.
  // All URLs verified live 2026-07-18.
  // ---------------------------------------------------------------------------
  regional_balance: [
    {
      name: 'The Hindu - World',
      url: 'https://www.thehindu.com/news/international/feeder/default.rss',
      category: 'regional_balance',
      tier: 1,
      language: 'en',
      region: 'india',
    },
    {
      name: 'AllAfrica',
      url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
      category: 'regional_balance',
      tier: 1,
      language: 'en',
      region: 'africa',
    },
    {
      name: 'MercoPress',
      url: 'https://en.mercopress.com/rss/',
      category: 'regional_balance',
      tier: 1,
      language: 'en',
      region: 'latin_america',
    },
    {
      name: 'Arab News',
      url: 'https://www.arabnews.com/rss.xml',
      category: 'regional_balance',
      tier: 1,
      language: 'en',
      region: 'saudi_arabia',
    },
    {
      name: 'Korea Herald',
      url: 'https://www.koreaherald.com/rss/newsAll',
      category: 'regional_balance',
      tier: 1,
      language: 'en',
      region: 'south_korea',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get all feeds belonging to a specific category.
 */
export function getFeedsByCategory(category: string): RssFeedEntry[] {
  return RSS_FEED_CATALOG[category] ?? [];
}

/**
 * Get every feed across all categories.
 */
export function getAllFeeds(): RssFeedEntry[] {
  return Object.values(RSS_FEED_CATALOG).flat();
}

/**
 * Get feeds filtered by reliability tier.
 */
export function getFeedsByTier(tier: 1 | 2 | 3): RssFeedEntry[] {
  return getAllFeeds().filter((f) => f.tier === tier);
}

/**
 * Smart feed selection based on a natural-language query string.
 * Analyzes keywords in the query and returns relevant feeds.
 * Always includes tier-1 world_news feeds as a baseline.
 */
export function getFeedsForQuery(query: string): RssFeedEntry[] {
  const q = query.toLowerCase();
  const matchedCategories = new Set<string>();

  // Always include tier-1 world news
  matchedCategories.add('world_news');

  // --- Keyword-to-category mapping ---
  const keywordMap: Record<string, string[]> = {
    // US politics
    us_politics: [
      'congress',
      'senate',
      'house of representatives',
      'democrat',
      'republican',
      'gop',
      'potus',
      'president',
      'white house',
      'election',
      'ballot',
      'supreme court',
      'scotus',
      'impeach',
      'filibuster',
      'legislation',
      'washington dc',
      'capitol',
      'biden',
      'trump',
      'us politics',
      'american politics',
      'united states politic',
    ],
    // Europe
    europe: [
      'europe',
      'european',
      'eu ',
      'brexit',
      'nato',
      'france',
      'french',
      'germany',
      'german',
      'uk ',
      'united kingdom',
      'britain',
      'british',
      'spain',
      'spanish',
      'italy',
      'italian',
      'poland',
      'polish',
      'ukraine',
      'ukrainian',
      'russia',
      'russian',
      'sweden',
      'norway',
      'denmark',
      'netherlands',
      'dutch',
      'belgium',
      'switzerland',
      'austria',
      'portugal',
      'greece',
      'balkans',
      'serbia',
      'romania',
      'hungary',
      'czech',
      'slovakia',
      'finland',
    ],
    // Middle East
    middle_east: [
      'middle east',
      'mideast',
      'israel',
      'israeli',
      'palestine',
      'palestinian',
      'gaza',
      'west bank',
      'iran',
      'iranian',
      'iraq',
      'iraqi',
      'syria',
      'syrian',
      'lebanon',
      'lebanese',
      'saudi',
      'arabia',
      'yemen',
      'yemeni',
      'jordan',
      'egypt',
      'egyptian',
      'turkey',
      'turkish',
      'kurdish',
      'kurd',
      'hamas',
      'hezbollah',
      'houthi',
      'gulf state',
      'uae',
      'dubai',
      'qatar',
      'bahrain',
      'oman',
      'kuwait',
    ],
    // Asia Pacific
    asia_pacific: [
      'asia',
      'asian',
      'china',
      'chinese',
      'japan',
      'japanese',
      'korea',
      'korean',
      'india',
      'indian',
      'pakistan',
      'pakistani',
      'taiwan',
      'taiwanese',
      'philippines',
      'filipino',
      'vietnam',
      'vietnamese',
      'indonesia',
      'indonesian',
      'malaysia',
      'thai',
      'thailand',
      'myanmar',
      'burma',
      'bangladesh',
      'sri lanka',
      'nepal',
      'australia',
      'australian',
      'new zealand',
      'pacific',
      'asean',
      'south china sea',
      'xinjiang',
      'tibet',
      'hong kong',
      'singapore',
      'cambodia',
      'laos',
    ],
    // Africa
    africa: [
      'africa',
      'african',
      'nigeria',
      'nigerian',
      'kenya',
      'kenyan',
      'ethiopia',
      'ethiopian',
      'south africa',
      'congo',
      'sudan',
      'sudanese',
      'somalia',
      'somali',
      'mozambique',
      'tanzania',
      'uganda',
      'ghana',
      'sahel',
      'sahara',
      'maghreb',
      'morocco',
      'algeria',
      'tunisia',
      'libya',
      'libyan',
      'zimbabwe',
      'angola',
      'cameroon',
      'senegal',
      'mali',
      'niger',
      'chad',
      'burkina faso',
      'rwanda',
    ],
    // Latin America
    latin_america: [
      'latin america',
      'south america',
      'central america',
      'mexico',
      'mexican',
      'brazil',
      'brazilian',
      'argentina',
      'colombi',
      'venezuela',
      'venezuelan',
      'chile',
      'chilean',
      'peru',
      'peruvian',
      'ecuador',
      'bolivia',
      'paraguay',
      'uruguay',
      'panama',
      'costa rica',
      'guatemala',
      'honduras',
      'el salvador',
      'caribbean',
      'cuba',
      'cuban',
      'haiti',
      'dominican',
      'puerto rico',
      'cartel',
      'narco',
    ],
    // Technology
    technology: [
      'tech',
      'technology',
      'software',
      'hardware',
      'ai ',
      'artificial intelligence',
      'machine learning',
      'deep learning',
      'neural network',
      'llm',
      'gpt',
      'robot',
      'automat',
      'cyber',
      'hack',
      'silicon valley',
      'startup',
      'app ',
      'apple',
      'google',
      'microsoft',
      'amazon',
      'meta',
      'facebook',
      'social media',
      'internet',
      'cloud',
      'saas',
      'semiconductor',
      'chip',
      'quantum',
      'vr ',
      'virtual reality',
      'augmented reality',
      'ar ',
      'privacy',
      'surveillance',
      'encryption',
      'data breach',
    ],
    // Finance
    finance: [
      'finance',
      'financial',
      'stock',
      'market',
      'wall street',
      'economy',
      'economic',
      'gdp',
      'inflation',
      'deflation',
      'recession',
      'interest rate',
      'fed ',
      'federal reserve',
      'central bank',
      'monetary',
      'fiscal',
      'bond',
      'treasury',
      'equity',
      'invest',
      'hedge fund',
      'banking',
      'bank ',
      'mortgage',
      'credit',
      'debt',
      'trade war',
      'tariff',
      'ipo ',
      'merger',
      'acquisition',
      'earnings',
      'revenue',
      'profit',
      'forex',
      'currency',
      'dollar',
      'euro ',
      'yen',
    ],
    // Crypto
    crypto: [
      'crypto',
      'bitcoin',
      'btc',
      'ethereum',
      'eth ',
      'blockchain',
      'defi',
      'nft',
      'token',
      'web3',
      'solana',
      'cardano',
      'altcoin',
      'stablecoin',
      'usdt',
      'usdc',
      'binance',
      'coinbase',
      'mining',
      'wallet',
      'ledger',
      'metamask',
      'dao ',
      'dex ',
      'cex ',
      'yield farm',
      'staking',
      'proof of',
      'layer 2',
      'l2 ',
      'lightning network',
      'taproot',
      'halving',
    ],
    // Defense & Intelligence
    defense_intel: [
      'defense',
      'defence',
      'military',
      'army',
      'navy',
      'air force',
      'marine',
      'pentagon',
      'warfare',
      'weapon',
      'missile',
      'nuclear weapon',
      'intelligence',
      'espionage',
      'spy',
      'cia ',
      'nsa ',
      'mi6',
      'mossad',
      'drone',
      'uav',
      'satellite',
      'hypersonic',
      'ballistic',
      'conflict',
      'war ',
      'invasion',
      'occupation',
      'insurgency',
      'terrorist',
      'terrorism',
      'counterterror',
      'special forces',
      'mercenary',
      'wagner',
      'arms deal',
      'sanction',
      'geopolitic',
      'nato ',
      'alliance',
    ],
    // Science & Health
    science_health: [
      'science',
      'scientific',
      'research',
      'study',
      'health',
      'medical',
      'medicine',
      'disease',
      'virus',
      'vaccine',
      'pandemic',
      'epidemic',
      'covid',
      'cancer',
      'gene',
      'genetic',
      'dna',
      'rna',
      'protein',
      'climate',
      'climate change',
      'global warming',
      'carbon',
      'emission',
      'nasa',
      'space',
      'asteroid',
      'planet',
      'mars',
      'moon',
      'orbit',
      'physics',
      'quantum',
      'biology',
      'chemistry',
      'neuroscience',
      'brain',
      'pharma',
      'drug',
      'fda ',
      'who ',
      'cdc ',
      'mental health',
      'obesity',
      'diabetes',
      'heart',
      'hospital',
    ],
    // Think Tanks
    think_tanks: [
      'think tank',
      'policy analysis',
      'foreign policy',
      'geostrateg',
      'brookings',
      'rand ',
      'csis ',
      'carnegie',
      'heritage foundation',
      'cato institute',
      'cfr ',
      'council on foreign',
      'chatham house',
      'atlantic council',
      'wilson center',
      'international relations',
      'diplomacy',
      'diplomatic',
    ],
    // Energy
    energy: [
      'energy',
      'oil',
      'petroleum',
      'gas ',
      'natural gas',
      'lng',
      'opec',
      'crude',
      'barrel',
      'refinery',
      'pipeline',
      'fracking',
      'nuclear energy',
      'nuclear power',
      'reactor',
      'uranium',
      'renewable',
      'solar',
      'wind power',
      'wind energy',
      'hydropower',
      'battery',
      'lithium',
      'ev ',
      'electric vehicle',
      'hydrogen',
      'grid',
      'electricity',
      'power plant',
      'utility',
      'coal',
      'carbon capture',
      'emission',
      'green energy',
      'clean energy',
    ],
    // Government
    government: [
      'government',
      'regulation',
      'regulatory',
      'legislation',
      'law',
      'executive order',
      'federal',
      'state department',
      'treasury',
      'sec ',
      'securities',
      'ftc ',
      'antitrust',
      'policy',
      'white house',
      'congress',
      'senate',
      'parliament',
      'eu commission',
      'un ',
      'united nations',
      'g7',
      'g20',
      'imf ',
      'world bank',
    ],
  };

  // Match categories based on keywords found in the query
  for (const [category, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (q.includes(keyword)) {
        matchedCategories.add(category);
        break;
      }
    }
  }

  // If nothing matched beyond world_news, add think_tanks for broad geopolitical coverage
  if (matchedCategories.size === 1) {
    matchedCategories.add('think_tanks');
  }

  // Collect feeds: tier-1 from world_news always, all tiers from matched categories
  const results: RssFeedEntry[] = [];
  const seenUrls = new Set<string>();

  for (const category of matchedCategories) {
    const feeds = RSS_FEED_CATALOG[category] ?? [];
    for (const feed of feeds) {
      // For world_news baseline, only include tier 1
      if (
        category === 'world_news' &&
        !matchedCategories.has('world_news_explicit') &&
        feed.tier !== 1
      ) {
        // If world_news was explicitly matched by keywords, include all tiers
        // Otherwise just tier 1 as baseline
        if (!keywordMatchesCategory(q, 'world_news', keywordMap)) {
          continue;
        }
      }
      if (!seenUrls.has(feed.url)) {
        seenUrls.add(feed.url);
        results.push(feed);
      }
    }
  }

  return results;
}

/** Check if a query has explicit keyword matches for a category. */
function keywordMatchesCategory(
  query: string,
  category: string,
  keywordMap: Record<string, string[]>,
): boolean {
  const keywords = keywordMap[category];
  if (!keywords) return false;
  return keywords.some((kw) => query.includes(kw));
}
