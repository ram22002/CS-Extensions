package com.eclipsiaanime

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.newSearchResponseList

class EclipsiaAnilistProvider : EclipsiaAnimeProvider() {
    override var name = "EclipsiaAnilist"
    override val apiName = "EclipsiaAnilist"
    override val mainPage: List<MainPageData>
        get() = if (EclipsiaStore.anilistEnabled) EclipsiaAnilistApi.activeRows() else emptyList()

    override suspend fun load(url: String): LoadResponse? =
        with(EclipsiaDetails) { loadDetails(url, anilist = true) } ?: super.load(url)

    override suspend fun search(query: String): List<SearchResponse>? =
        if (EclipsiaStore.anilistEnabled) EclipsiaAnilistApi.search(this, query) else emptyList()

    override suspend fun search(query: String, page: Int): SearchResponseList? =
        if (EclipsiaStore.anilistEnabled)
            newSearchResponseList(EclipsiaAnilistApi.search(this, query, page), hasNext = true)
        else newSearchResponseList(emptyList(), hasNext = false)

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse =
        EclipsiaAnilistApi.page(this, page, request)
}
