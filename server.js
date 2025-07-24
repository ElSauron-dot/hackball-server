<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<title>HackBall Başlangıç</title>
<style>
  * { box-sizing: border-box; }
  body, html {
    margin:0; padding:0; height:100%; width:100%; background:#222; color:#eee; font-family: Arial, sans-serif;
    display:flex; align-items:center; justify-content:center;
  }
  #startScreen {
    background:#333;
    padding:30px;
    border-radius:12px;
    box-shadow:0 0 15px #000;
    width:360px;
    text-align:center;
  }
  #startScreen h2 {
    margin-bottom: 20px;
    font-weight: 700;
  }
  input[type=text] {
    width:100%;
    padding:10px;
    margin-bottom:15px;
    border-radius:6px;
    border:none;
    font-size:16px;
  }
  button {
    padding: 12px 20px;
    border:none;
    background: #e03e3e;
    color: white;
    font-weight: 700;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    margin: 5px;
    flex: 1;
  }
  button:hover {
    background: #b92b2b;
  }
  .team-select {
    display: flex;
    justify-content: space-around;
    margin-bottom: 15px;
  }
  .team-select label {
    cursor: pointer;
    user-select: none;
  }
  .team-select input[type=radio] {
    margin-right: 6px;
  }
  #errorMsg {
    color: #ff5555;
    margin-bottom: 10px;
    display: none;
  }
  #btnContainer {
    display: flex;
  }
</style>
</head>
<body>

<div id="startScreen">
  <h2>HackBall'a Hoşgeldin</h2>

  <div id="errorMsg"></div>

  <input type="text" id="nicknameInput" placeholder="Takma adınız" maxlength="15" autocomplete="off" />

  <input type="text" id="partyIdInput" placeholder="Parti ID (katılmak için yazın)" maxlength="10" autocomplete="off" />

  <div class="team-select">
    <label><input type="radio" name="team" value="red" checked /> Kırmızı Takım</label>
    <label><input type="radio" name="team" value="blue" /> Mavi Takım</label>
  </div>

  <div id="btnContainer">
    <button id="createPartyBtn">Parti Oluştur</button>
    <button id="joinPartyBtn">Partiye Katıl</button>
  </div>
</div>

<script>
  const nicknameInput = document.getElementById('nicknameInput');
  const partyIdInput = document.getElementById('partyIdInput');
  const createPartyBtn = document.getElementById('createPartyBtn');
  const joinPartyBtn = document.getElementById('joinPartyBtn');
  const errorMsg = document.getElementById('errorMsg');

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }
  function hideError() {
    errorMsg.style.display = 'none';
  }

  function validateNickname(nick) {
    return nick && nick.length > 0 && nick.length <= 15;
  }
  function validatePartyId(id) {
    return /^[a-zA-Z0-9]{3,10}$/.test(id);
  }

  createPartyBtn.addEventListener('click', () => {
    const nick = nicknameInput.value.trim();
    if (!validateNickname(nick)) {
      showError("Lütfen geçerli bir takma ad girin (1-15 karakter).");
      return;
    }
    hideError();
    startGame({ nickname: nick, partyId: null, team: getSelectedTeam() });
  });

  joinPartyBtn.addEventListener('click', () => {
    const nick = nicknameInput.value.trim();
    const partyId = partyIdInput.value.trim();
    if (!validateNickname(nick)) {
      showError("Lütfen geçerli bir takma ad girin (1-15 karakter).");
      return;
    }
    if (!validatePartyId(partyId)) {
      showError("Geçerli bir Parti ID girin (3-10 alfanümerik karakter).");
      return;
    }
    hideError();
    startGame({ nickname: nick, partyId, team: getSelectedTeam() });
  });

  function getSelectedTeam() {
    return document.querySelector('input[name="team"]:checked').value;
  }

  function startGame({ nickname, partyId, team }) {
    // Örnek olarak alert ile gösteriyoruz, sen socket bağla
    alert(`Başlıyorsun!\nNick: ${nickname}\nParti ID: ${partyId || '(yeni parti oluşturulacak)'}\nTakım: ${team}`);

    // Buraya socket bağlantısını koyabilirsin, ya da sayfayı değiştir:
    // window.location.href = `game.html?nick=${encodeURIComponent(nickname)}&party=${partyId || ''}&team=${team}`;
  }
</script>

</body>
</html>
