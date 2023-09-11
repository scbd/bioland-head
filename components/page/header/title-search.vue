<template>
    <div class="navbar-header row align-items-center w-100x">
        <div class="col-10 col-sm-7 col-md-8 col-lg-9 d-flex align-items-center">
            <a class=" navbar-btn pull-left flip" href="/en" title="Sri Lanka">
                <img class="logo" src="@/assets/flag-sri-lanka.png" />
            </a>
            <a class="navbar-brand pull-left flip" href="/en" title="Convention on Biological Diversity">Sri Lanka</a>
            <a class="sublogo navbar-btn pull-left flip" href="/en" title="Sri Lanka">
                <img src="@/assets/cbd-logo-white.svg" style="max-height:35px;"/>
            </a>
            <a class="navbar-subbrand pull-left flip" href="/en" title="Convention on Biological Diversity">
                <strong>Convention on Biological Diversity</strong>
                <br/>Clearing House Mechanism
            </a>
        </div>
        <div class="d-sm-none col-2 text-end">
            <a href="search-blank.html">
                <button class="btn">
                    <i class="bi-search"></i>
                </button>
            </a>
        </div>
        <div class="col-5 col-md-4 col-lg-3 d-none d-sm-flex justify-content-end align-items-center">
            <div class="input-group">
                <div class="input-group-prepend"><span class="input-group-text" id="basic-addon1">
                    <i class="bi-search"></i></span>
                </div>
                <input type="text" class="form-control" placeholder="Search this site" aria-label="search" aria-describedby="basic-addon1">
            </div>
        </div>
    </div>  
</template>
<style>
  .logo {
    max-height: 60px;
  }
</style>