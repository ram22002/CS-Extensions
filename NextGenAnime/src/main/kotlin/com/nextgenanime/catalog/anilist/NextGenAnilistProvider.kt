package com.nextgenanime

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.newSearchResponseList

class NextGenAnilistProvider : NextGenAnimeProvider() {
    override var name = "NextGenAnilist"
    override val apiName = "NextGenAnilist"
    override val mainPage: List<MainPageData>
        get() = if (NextGenStore.anilistEnabled) NextGenAnilistApi.activeRows() else emptyList()

    override suspend fun load(url: String): LoadResponse? =
        with(NextGenDetails) { loadDetails(url, anilist = true) } ?: super.load(url)

    override suspend fun search(query: String): List<SearchResponse>? =
        if (NextGenStore.anilistEnabled) NextGenAnilistApi.search(this, query) else emptyList()

    override suspend fun search(query: String, page: Int): SearchResponseList? =
        if (NextGenStore.anilistEnabled)
            newSearchResponseList(NextGenAnilistApi.search(this, query, page), hasNext = true)
        else newSearchResponseList(emptyList(), hasNext = false)

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse =
        NextGenAnilistApi.page(this, page, request)
}
