window.actelyo.onStatus((text) => {
  document.getElementById('status').textContent = text;
  const failed = text.startsWith('Impossible');
  document.getElementById('retry').hidden = !failed;
  document.getElementById('loader').hidden = failed;
});
document.getElementById('retry').addEventListener('click', () => window.actelyo.retry());
