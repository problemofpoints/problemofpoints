---
title: Trying out DeepTriangle
date: '2018-08-04'
slug: trying-out-deeptriangle
categories: []
tags:
  - reserving
subtitle: A Deep Learning Approach to Loss Reserving
---



# Goal

Attempt to replicate the results found in the paper [DeepTriangle](https://arxiv.org/abs/1804.09253) (see also this [presentation](http://ibnr.netlify.com)) using the [R package](https://github.com/kevinykuo/deeptriangle) of the same name).

This initial post will simply run the code from the package's `README.Rmd`.

<!--more-->
# Get the data


```r
# devtools::install_github("kevinykuo/deeptriangle")
# devtools::install_github("kevinykuo/insurance")

library(deeptriangle)
library(tidyverse)
library(keras)

data <- dt_data_prep(insurance::schedule_p, dt_group_codes)

lobs <- c("workers_compensation", "commercial_auto",
          "private_passenger_auto", "other_liability")

data$workers_compensation %>% glimpse()
#> Observations: 5,000
#> Variables: 23
#> $ lob                          <chr> "workers_compensation", "workers_...
#> $ group_code                   <fct> 10385, 10385, 10385, 10385, 10385...
#> $ group_name                   <chr> "FFVA Mut Ins Co", "FFVA Mut Ins ...
#> $ accident_year                <int> 1988, 1988, 1988, 1988, 1988, 198...
#> $ development_year             <int> 1988, 1989, 1990, 1991, 1992, 199...
#> $ development_lag              <int> 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1,...
#> $ incurred_loss                <dbl> 12956, 13852, 14002, 13600, 13537...
#> $ cumulative_paid_loss         <dbl> 4550, 9458, 11810, 12739, 12431, ...
#> $ bulk_loss                    <dbl> 2784, 994, -97, -283, 81, -215, -...
#> $ earned_premium_direct        <dbl> 17428, 17428, 17428, 17428, 17428...
#> $ earned_premium_ceded         <dbl> 865, 865, 865, 865, 865, 865, 865...
#> $ earned_premium_net           <dbl> 16563, 16563, 16563, 16563, 16563...
#> $ single                       <int> 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ...
#> $ posted_reserve_97            <dbl> 49911, 49911, 49911, 49911, 49911...
#> $ calendar_year                <dbl> 1988, 1989, 1990, 1991, 1992, 199...
#> $ incremental_paid_loss        <dbl> 4550, 4908, 2352, 929, -308, 162,...
#> $ case_reserves                <dbl> 0.5075167542, 0.2652901044, 0.132...
#> $ incremental_paid_actual      <dbl> 0.274708688, 0.296323130, 0.14200...
#> $ incremental_paid             <dbl> 0.274708688, 0.296323130, 0.14200...
#> $ case_reserves_actual         <dbl> 0.5075167542, 0.2652901044, 0.132...
#> $ bucket                       <chr> NA, "train", "train", "train", "t...
#> $ prior_paid_along_ay          <list> [<0, 0, 0, 0, 0, 0, 0, 0, 0>, <0...
#> $ prior_case_reserves_along_ay <list> [<0, 0, 0, 0, 0, 0, 0, 0, 0>, <0...
```

# Run the model


```r
predictions <- lobs %>%
  map(
    function(x) {
      # clear session and instantiate model
      k_clear_session()
      model <- dt_model()

      c(training_data, validation_data, full_training_data) %<-%
        dt_train_validation_split(data[[x]])

      message("Training - ", x)

      # determine number of epochs
      epochs_to_train <- dt_optimize_epochs(
        model, training_data, validation_data
      )

      # clear session and reinstantiate model
      k_clear_session()
      model <- dt_model()

      # fit model to all training data
      history <- model %>%
        fit(x = full_training_data$x,
            y = full_training_data$y,
            batch_size = 128,
            epochs = epochs_to_train,
            verbose = 0)
      dt_compute_predictions(model, data[[x]])
    }) %>%
  bind_rows()
```

# Check the model fit


```r
model_results <- dt_compute_metrics(predictions) %>%
  bind_rows(stochastic_model_results) %>%
  gather(metric, value, mape, rmspe)
```


```r
dt_tabulate_metrics(model_results, metric = "mape") %>%
  knitr::kable(booktabs = "T", digits = 3)
```



|lob                    |  Mack|   ODP|   CIT|   LIT|   CSR| DeepTriangle|
|:----------------------|-----:|-----:|-----:|-----:|-----:|------------:|
|commercial_auto        | 0.060| 0.217| 0.052| 0.052| 0.074|        0.064|
|other_liability        | 0.134| 0.223| 0.165| 0.152| 0.292|        0.107|
|private_passenger_auto | 0.038| 0.039| 0.038| 0.040| 0.037|        0.021|
|workers_compensation   | 0.053| 0.105| 0.054| 0.054| 0.075|        0.042|
<br>

```r
dt_tabulate_metrics(model_results, metric = "rmspe") %>%
  knitr::kable(booktabs = "T", digits = 3)
```



|lob                    |  Mack|   ODP|   CIT|   LIT|   CSR| DeepTriangle|
|:----------------------|-----:|-----:|-----:|-----:|-----:|------------:|
|commercial_auto        | 0.080| 0.822| 0.076| 0.074| 0.126|        0.087|
|other_liability        | 0.202| 0.477| 0.220| 0.209| 0.843|        0.157|
|private_passenger_auto | 0.061| 0.063| 0.057| 0.060| 0.055|        0.032|
|workers_compensation   | 0.079| 0.368| 0.080| 0.080| 0.159|        0.069|

These results are very close to what we expected!

# Create actual vs. prediction plots


```r
# devtools::install_github("thomasp85/patchwork")
library(patchwork)

paid_plot <- dt_plot_predictions(predictions, "7080", "workers_compensation", "paid_loss")
case_plot <- dt_plot_predictions(predictions, "7080", "workers_compensation", "claims_outstanding")

paid_plot + case_plot + plot_layout(ncol = 1)
```

<div class="figure" style="text-align: center">
<img src="/post/2018-08-04-trying-out-deeptriangle_files/figure-html/plot1-1.png" alt="Company 7080, Workers' Compensation" width="100%" />
<p class="caption">Figure 1 Company 7080, Workers' Compensation</p>
</div>



```r
paid_plot2 <- dt_plot_predictions(predictions, "1767", "commercial_auto", "paid_loss")
case_plot2 <- dt_plot_predictions(predictions, "1767", "commercial_auto", "claims_outstanding")

paid_plot2 + case_plot2 + plot_layout(ncol = 1)
```

<div class="figure" style="text-align: center">
<img src="/post/2018-08-04-trying-out-deeptriangle_files/figure-html/plot2-1.png" alt="Company 1767, Commercial Auto" width="100%" />
<p class="caption">Figure 2 Company 1767, Commercial Auto</p>
</div>



```r
paid_plot3 <- dt_plot_predictions(predictions, "337", "workers_compensation", "paid_loss")
case_plot3 <- dt_plot_predictions(predictions, "337", "workers_compensation", "claims_outstanding")

paid_plot3 + case_plot3 + plot_layout(ncol = 1)
```

<div class="figure" style="text-align: center">
<img src="/post/2018-08-04-trying-out-deeptriangle_files/figure-html/plot3-1.png" alt="Company 337, Workers' Compensation" width="100%" />
<p class="caption">Figure 3 Company 337, Workers' Compensation</p>
</div>

# Next steps

In this post, we successfully ran the code to apply the DeepTriangle method. Now we can dig into the method to better understand it and make adjustments and extensions.
