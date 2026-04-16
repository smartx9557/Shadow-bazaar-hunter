export interface MarketplaceListing {
  item_id: number;
  player_id: number;
  player_name: string;
  quantity: number;
  price: number;
  content_updated: number;
  last_checked: number;
  content_updated_relative: string;
  last_checked_relative: string;
}

export interface MarketplaceData {
  item_id: number;
  item_name: string;
  market_price: number;
  bazaar_average: number;
  total_listings: number;
  listings: MarketplaceListing[];
}

export interface TornProfile {
  name: string;
  player_id: number;
  level: number;
  status: {
    description: string;
    state: string;
    color: string;
  };
  age: number;
  gender: string;
}

export interface EnrichedSeller extends TornProfile {
  seller_id: number;
}

export interface SelectedItem {
  id: string;
  name: string;
}
