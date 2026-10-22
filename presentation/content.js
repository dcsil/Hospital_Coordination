// Add media paths here when the final assets are ready.
window.DECK = {
  appUrl: window.PRESENTATION_CONFIG?.appUrl || 'http://127.0.0.1:5173/',
  media: { openingVideo: 'assets/opening.mp4' },
  // Keep null until this exact metric and eligibility have been measured.
  // { baselineMinutes, coordinatedMinutes, eligibilityViolations, source,
  //   metric: 'Mean ambulance unavailable minutes per completed call' }
  validation: null,
  chapters: [
    { id: 'title', number: '1', label: 'Kinetic', time: '0:15' },
    { id: 'opening', number: '2', label: 'Opening', time: '1:00' },
    { id: 'baseline', number: '3', label: 'The bottleneck', time: '1:00' },
    { id: 'concept', number: '4', label: 'The concept', time: '0:45' },
    { id: 'product', number: '5', label: 'Product demo', time: '0:30' },
    { id: 'architecture', number: '6', label: 'Architecture', time: '1:30' },
    { id: 'evaluation', number: '7', label: 'Evaluation', time: '0:30' },
    { id: 'results', number: '8', label: 'Results', time: '0:45' },
    { id: 'limits', number: '9', label: 'Limits', time: '0:30' },
  ],
};
