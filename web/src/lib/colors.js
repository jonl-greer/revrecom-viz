// Shared palette. District colours match the Manim video.
export const DISTRICT_COLORS = ['#E63946', '#2F6FD6', '#F4C430', '#2A9D55'];
// Merged region: the two districts' colours mixed like paint, keyed by the sorted label pair
// (0 red, 1 blue, 2 yellow, 3 green).
const MERGED_COLORS = {
  '0-1': '#7B3FA8', // red + blue = purple
  '0-2': '#F07A1A', // red + yellow = orange
  '0-3': '#8B5A2B', // red + green = brown
  '1-2': '#7CB83A', // blue + yellow = yellow-green, lighter than district green
  '1-3': '#138A8A', // blue + green = teal
  '2-3': '#B5A82A', // yellow + green = olive
};
export const mergedColor = (a, b) => MERGED_COLORS[a < b ? `${a}-${b}` : `${b}-${a}`];
export const COLORS = {
  tree: '#FFFFFF',
  cut: '#FF4FB0',
  highlight: '#FFFFFF',
  reject: '#FF6B6B',
  border: '#11141B',
  board: '#11141B',
  gridLine: 'rgba(17, 20, 27, 0.35)',
  ink: '#1E2433',
  muted: '#69718A',
  shadow: '#CDD3DE',
  bandA: '#A9B1C2',
  bandB: '#D3D8E1',
};
