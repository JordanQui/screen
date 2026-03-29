<template>
  <div class="patch-index">
    <h1>Patches</h1>

    <section>
      <h2>Waves</h2>
      <ul>
        <!-- <li><NuxtLink to="/waves/wav1">wav1</NuxtLink></li> -->
        <!-- <li><NuxtLink to="/waves/wav2">wav2</NuxtLink></li> -->
        <!-- <li><NuxtLink to="/waves/wav3a">wav3a</NuxtLink></li> -->
        <!-- <li><NuxtLink to="/waves/wav4a">wav4a</NuxtLink></li> -->
        <!-- <li><NuxtLink to="/waves/wav5e">wav5e</NuxtLink></li> -->
        <li><NuxtLink to="/waves/wav6a">wav6a</NuxtLink></li>
        <li><NuxtLink to="/waves/wav7c">wav7c</NuxtLink></li>
        <li><NuxtLink to="/waves/wav8">wav8</NuxtLink></li>
        <li><NuxtLink to="/waves/wav9">wav9</NuxtLink></li>
      </ul>
    </section>

    <!-- <section>
      <h2>Ronde Insta</h2>
      <ul>
        <li><NuxtLink to="/ronde-insta/ronde1g">ronde1g</NuxtLink></li>
        <li><NuxtLink to="/ronde-insta/ronde1i">ronde1i</NuxtLink></li>
        <li><NuxtLink to="/ronde-insta/ronde1j">ronde1j</NuxtLink></li>
        <li><NuxtLink to="/ronde-insta/ronde1ll">ronde1ll</NuxtLink></li>
        <li><NuxtLink to="/ronde-insta/ronde1mzoomed">ronde1mzoomed</NuxtLink></li>
      </ul>
    </section> -->
  </div>
</template>

<style scoped>
.patch-index {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  font-family: monospace;
  color: #e0e0e0;
  background: #111;
  min-height: 100vh;
}

h1 {
  font-size: 1.4rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #333;
  padding-bottom: 0.5rem;
}

h2 {
  font-size: 1rem;
  color: #888;
  margin: 1.2rem 0 0.5rem;
}

ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

li a {
  display: inline-block;
  padding: 0.4rem 0.8rem;
  background: #222;
  border: 1px solid #333;
  border-radius: 4px;
  color: #ccc;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}

li a:hover {
  background: #2a2a2a;
  border-color: #555;
  color: #fff;
}
</style>
