export interface PaletteGroup {
  id: string;
  name: string;
  nameKey?: string;
}

export interface ColorPalette {
  id: string;
  groupId: string;
  name: string;
  colors: string[];
  source?: { name: string; url: string };
}

export const defaultPaletteGroups: PaletteGroup[] = [
  {
    id: 'journals',
    name: 'Journal Palettes',
    nameKey: 'palettes.groups.journals'
  },
  {
    id: 'categorical',
    name: 'Categorical',
    nameKey: 'palettes.groups.categorical'
  },
  {
    id: 'sequential',
    name: 'Sequential',
    nameKey: 'palettes.groups.sequential'
  },
  { id: 'diverging', name: 'Diverging', nameKey: 'palettes.groups.diverging' }
];

const ggsci = {
  name: 'ggsci · Nan Xiao',
  url: 'https://nanx.me/ggsci/articles/ggsci.html'
};
const tol = { name: 'Paul Tol', url: 'https://sronpersonalpages.nl/~pault/' };
const brewer = {
  name: 'ColorBrewer · Cynthia Brewer',
  url: 'https://colorbrewer2.org/'
};
const matplotlib = {
  name: 'Matplotlib',
  url: 'https://matplotlib.org/stable/gallery/color/colormap_reference.html'
};

function preset(
  id: string,
  groupId: string,
  name: string,
  colors: string,
  source: ColorPalette['source']
): ColorPalette {
  return {
    id: `builtin-${id}`,
    groupId,
    name,
    colors: colors.split(' '),
    source
  };
}

/** Palette specifications, with attribution and canonical source links.
 * Journal palette values: https://github.com/nanxstats/ggsci/blob/master/R/palettes.R
 * ColorBrewer: https://colorbrewer2.org/export/colorbrewer.json
 * Matplotlib: nine samples at round(i * 255 / 8), rounded to 8-bit RGB.
 * https://github.com/matplotlib/matplotlib/blob/main/lib/matplotlib/_cm_listed.py
 * Journal-inspired palettes are not publisher-mandated color standards.
 */
export const builtinPalettes: ColorPalette[] = [
  preset(
    'npg',
    'journals',
    'NPG / Nature',
    '#E64B35 #4DBBD5 #00A087 #3C5488 #F39B7F #8491B4 #91D1C2 #DC0000 #7E6148 #B09C85',
    ggsci
  ),
  preset(
    'aaas',
    'journals',
    'AAAS / Science',
    '#3B4992 #EE0000 #008B45 #631879 #008280 #BB0021 #5F559B #A20056 #808180 #1B1919',
    ggsci
  ),
  preset(
    'nejm',
    'journals',
    'NEJM',
    '#BC3C29 #0072B5 #E18727 #20854E #7876B1 #6F99AD #FFDC91 #EE4C97',
    ggsci
  ),
  preset(
    'lancet',
    'journals',
    'Lancet',
    '#00468B #ED0000 #42B540 #0099B4 #925E9F #FDAF91 #AD002A #ADB6B6 #1B1919',
    ggsci
  ),
  preset(
    'jama',
    'journals',
    'JAMA',
    '#374E55 #DF8F44 #00A1D5 #B24745 #79AF97 #6A6599 #80796B',
    ggsci
  ),
  preset(
    'okabe-ito',
    'categorical',
    'Okabe–Ito',
    '#000000 #E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00 #CC79A7',
    {
      name: 'Masataka Okabe / Kei Ito',
      url: 'https://jfly.uni-koeln.de/color/'
    }
  ),
  preset(
    'tol-bright',
    'categorical',
    'Paul Tol · Bright',
    '#4477AA #EE6677 #228833 #CCBB44 #66CCEE #AA3377 #BBBBBB',
    tol
  ),
  preset(
    'tol-muted',
    'categorical',
    'Paul Tol · Muted',
    '#CC6677 #332288 #DDCC77 #117733 #88CCEE #882255 #44AA99 #999933 #AA4499',
    tol
  ),
  preset(
    'tol-vibrant',
    'categorical',
    'Paul Tol · Vibrant',
    '#EE7733 #0077BB #33BBEE #EE3377 #CC3311 #009988 #BBBBBB',
    tol
  ),
  preset(
    'category10',
    'categorical',
    'D3 · Category10',
    '#1F77B4 #FF7F0E #2CA02C #D62728 #9467BD #8C564B #E377C2 #7F7F7F #BCBD22 #17BECF',
    { name: 'D3', url: 'https://d3js.org/d3-scale-chromatic/categorical' }
  ),
  preset(
    'set2',
    'categorical',
    'ColorBrewer · Set2',
    '#66C2A5 #FC8D62 #8DA0CB #E78AC3 #A6D854 #FFD92F #E5C494 #B3B3B3',
    brewer
  ),
  preset(
    'dark2',
    'categorical',
    'ColorBrewer · Dark2',
    '#1B9E77 #D95F02 #7570B3 #E7298A #66A61E #E6AB02 #A6761D #666666',
    brewer
  ),
  preset(
    'paired',
    'categorical',
    'ColorBrewer · Paired',
    '#A6CEE3 #1F78B4 #B2DF8A #33A02C #FB9A99 #E31A1C #FDBF6F #FF7F00 #CAB2D6 #6A3D9A #FFFF99 #B15928',
    brewer
  ),
  preset(
    'viridis',
    'sequential',
    'Viridis',
    '#440154 #472D7B #3B528B #2C728E #21918C #27AD81 #5CC863 #AADC32 #FDE725',
    matplotlib
  ),
  preset(
    'plasma',
    'sequential',
    'Plasma',
    '#0D0887 #4C02A1 #7E03A8 #AA2395 #CC4778 #E56B5D #F89441 #FDC328 #F0F921',
    matplotlib
  ),
  preset(
    'magma',
    'sequential',
    'Magma',
    '#000004 #1D1147 #51127C #832681 #B73779 #E55064 #FB8761 #FEC287 #FCFDBF',
    matplotlib
  ),
  preset(
    'cividis',
    'sequential',
    'Cividis',
    '#00224E #1A386F #434E6C #61656F #7D7C78 #9A9376 #BBAD6D #DDC858 #FEE838',
    matplotlib
  ),
  preset(
    'blues',
    'sequential',
    'ColorBrewer · Blues',
    '#F7FBFF #DEEBF7 #C6DBEF #9ECAE1 #6BAED6 #4292C6 #2171B5 #08519C #08306B',
    brewer
  ),
  preset(
    'greens',
    'sequential',
    'ColorBrewer · Greens',
    '#F7FCF5 #E5F5E0 #C7E9C0 #A1D99B #74C476 #41AB5D #238B45 #006D2C #00441B',
    brewer
  ),
  preset(
    'oranges',
    'sequential',
    'ColorBrewer · Oranges',
    '#FFF5EB #FEE6CE #FDD0A2 #FDAE6B #FD8D3C #F16913 #D94801 #A63603 #7F2704',
    brewer
  ),
  preset(
    'rdbu',
    'diverging',
    'ColorBrewer · RdBu',
    '#B2182B #D6604D #F4A582 #FDDBC7 #F7F7F7 #D1E5F0 #92C5DE #4393C3 #2166AC',
    brewer
  ),
  preset(
    'rdylbu',
    'diverging',
    'ColorBrewer · RdYlBu',
    '#D73027 #F46D43 #FDAE61 #FEE090 #FFFFBF #E0F3F8 #ABD9E9 #74ADD1 #4575B4',
    brewer
  ),
  preset(
    'spectral',
    'diverging',
    'ColorBrewer · Spectral',
    '#D53E4F #F46D43 #FDAE61 #FEE08B #FFFFBF #E6F598 #ABDDA4 #66C2A5 #3288BD',
    brewer
  )
];
