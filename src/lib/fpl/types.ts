/**
 * Types for the public Fantasy Premier League API at
 * https://fantasy.premierleague.com/api/ — only the fields this app relies on are
 * declared. The API is unofficial and occasionally adds or renames fields, so
 * everything the model treats as optional is marked as such.
 */

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  deadline_time_epoch: number;
  finished: boolean;
  data_checked: boolean;
  is_previous: boolean;
  is_current: boolean;
  is_next: boolean;
  average_entry_score: number;
  highest_score: number | null;
  most_selected: number | null;
  most_captained: number | null;
  most_transferred_in: number | null;
  top_element: number | null;
  transfers_made: number;
  chip_plays: Array<{ chip_name: string; num_played: number }>;
}

export interface FplTeam {
  id: number;
  code: number;
  name: string;
  short_name: string;
  played: number;
  points: number;
  position: number;
  strength: number | null;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface FplElementType {
  id: number;
  singular_name: string;
  singular_name_short: string;
  plural_name_short: string;
  squad_select: number;
  squad_min_play: number;
  squad_max_play: number;
}

/** Per-player season aggregates plus metadata. */
export interface FplElement {
  id: number;
  code: number;
  element_type: number;
  team: number;
  team_code: number;
  web_name: string;
  first_name: string;
  second_name: string;
  now_cost: number;
  cost_change_start: number;
  cost_change_event: number;
  status: string;
  news: string;
  news_added: string | null;
  chance_of_playing_this_round: number | null;
  chance_of_playing_next_round: number | null;
  selected_by_percent: string;
  transfers_in_event: number;
  transfers_out_event: number;
  form: string;
  points_per_game: string;
  total_points: number;
  event_points: number;
  ep_this: string | null;
  ep_next: string | null;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  tackles: number;
  defensive_contribution: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
  ict_index: string;
  threat: string;
  creativity: string;
  influence: string;
}

export interface FplGameSettings {
  squad_squadsize: number;
  squad_squadplay: number;
  squad_team_limit: number;
  squad_total_spend: number;
  transfers_sell_on_fee: number;
  max_extra_free_transfers: number;
  ui_currency_multiplier: number;
}

export interface FplChip {
  id: number;
  name: string;
  number: number;
  start_event: number;
  stop_event: number;
  chip_type: string;
}

export interface FplBootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
  game_settings: FplGameSettings;
  chips: FplChip[];
  total_players: number;
}

export interface FplFixture {
  id: number;
  code: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_score: number | null;
  team_a_score: number | null;
  team_h_difficulty: number;
  team_a_difficulty: number;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
  minutes: number;
}

/** One row of a player's per-season totals from `element-summary`. */
export interface FplHistoryPast {
  season_name: string;
  element_code: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  tackles: number;
  defensive_contribution: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
}

/** One gameweek of a player's current-season record from `element-summary`. */
export interface FplHistoryEntry {
  element: number;
  fixture: number;
  opponent_team: number;
  round: number;
  was_home: boolean;
  kickoff_time: string;
  team_h_score: number | null;
  team_a_score: number | null;
  total_points: number;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  tackles: number;
  defensive_contribution: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  value: number;
  transfers_balance: number;
  selected: number;
}

export interface FplElementSummary {
  fixtures: Array<{
    id: number;
    event: number | null;
    event_name: string | null;
    is_home: boolean;
    difficulty: number;
    kickoff_time: string | null;
    team_h: number;
    team_a: number;
  }>;
  history: FplHistoryEntry[];
  history_past: FplHistoryPast[];
}

export interface FplEntryLeague {
  id: number;
  name: string;
  short_name?: string | null;
  created?: string;
  closed?: boolean;
  rank?: number | null;
  entry_rank?: number | null;
  entry_last_rank?: number | null;
  entry_can_leave?: boolean;
  entry_can_admin?: boolean;
  entry_can_invite?: boolean;
  start_event?: number;
  admin_entry?: number | null;
}

export interface FplEntry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  summary_overall_points: number | null;
  summary_overall_rank: number | null;
  summary_event_points: number | null;
  summary_event_rank: number | null;
  current_event: number | null;
  last_deadline_bank: number | null;
  last_deadline_value: number | null;
  last_deadline_total_transfers: number | null;
  leagues?: {
    classic?: FplEntryLeague[];
    h2h?: FplEntryLeague[];
  };
}

export interface FplClassicLeagueStanding {
  id: number;
  event_total: number;
  player_name: string;
  rank: number;
  last_rank: number | null;
  rank_sort: number;
  total: number;
  entry: number;
  entry_name: string;
}

export interface FplClassicLeagueStandings {
  league: {
    id: number;
    name: string;
    created: string;
    closed: boolean;
    start_event: number;
  };
  standings: {
    has_next: boolean;
    page: number;
    results: FplClassicLeagueStanding[];
  };
  new_entries?: {
    has_next: boolean;
    page: number;
    results: unknown[];
  };
}

export interface FplEntryPick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  selling_price?: number;
  purchase_price?: number;
}

export interface FplEntryPicks {
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  };
  picks: FplEntryPick[];
}

export interface FplEntryHistory {
  current: Array<{
    event: number;
    points: number;
    total_points: number;
    rank: number | null;
    overall_rank: number | null;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  }>;
  past: Array<{ season_name: string; total_points: number; rank: number }>;
  chips: Array<{ name: string; time: string; event: number }>;
}

export interface FplLiveElement {
  id: number;
  stats: {
    minutes: number;
    total_points: number;
    bonus: number;
    bps: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    saves: number;
    defensive_contribution: number;
  };
}

export interface FplLive {
  elements: FplLiveElement[];
}
