package com.nextgenanime

import com.lagradost.cloudstream3.HomePageResponse
import com.lagradost.cloudstream3.LoadResponse
import com.lagradost.cloudstream3.MainPageData
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SearchResponseList
import com.lagradost.cloudstream3.newSearchResponseList

class NextGenKitsuProvider : NextGenAnimeProvider() {
    override var name = "NextGenKitsu"
    override val apiName = "NextGenKitsu"
    override val mainPage: List<MainPageData>
        get() = if (NextGenStore.kitsuEnabled) NextGenKitsuApi.activeRows() else emptyList()

    override suspend fun load(url: String): LoadResponse? =
        with(NextGenDetails) { loadDetails(url, kitsu = true) } ?: super.load(url)

    override suspend fun search(query: String): List<SearchResponse>? =
        if (NextGenStore.kitsuEnabled) NextGenKitsuApi.search(this, query) else emptyList()

    override suspend fun search(query: String, page: Int): SearchResponseList? =
        if (NextGenStore.kitsuEnabled)
            newSearchResponseList(NextGenKitsuApi.search(this, query, page), hasNext = true)
        else newSearchResponseList(emptyList(), hasNext = false)

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse =
        NextGenKitsuApi.page(this, page, request)
}
